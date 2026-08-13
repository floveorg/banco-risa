// Pure logic: Telegram getUpdates -> ordered actions + new offset. No I/O.

import { createHash } from 'node:crypto';

const APPROVE_WORDS = new Set(['ok', 'si', 'sí', 'yes', 'publicar', 'publish', 'dale', 'adelante', 'aprobado', 'subir', 'listo']);
const REJECT_WORDS = new Set(['no', 'borrar', 'delete', 'rechazar', 'quitar', 'fuera', 'cancelar', 'anular']);

const MAX_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_DURATION_S = 1000;              // 1000 seconds
export { MAX_FILE_BYTES, MAX_DURATION_S };

// Obfuscated store of the uploader's Telegram id. One-way, salted: the hash is
// stable per bot install (TG_ID_SECRET) but never reversible, so the id never
// travels in claro beyond DM autor / grupo privado / cabecera del bot.
export function hashId(chatId, secret = '') {
  return createHash('sha256').update(String(secret) + ':' + String(chatId)).digest('hex');
}

// Which identity fields land in queue.json (committed to the public repo):
//   ①+②  -> { idHash }    (Nombre público oscurece el ID — hash 🔒)
//   solo ① -> { idDirect } (ID directo)
//   ③ / ② / nada -> {}     (sin identidad Telegram en el repo)
export function identityOf(sel, chatId, secret = '') {
  const s = sel || {};
  if (s.anon) return {};
  if (s.tg && s.name) return { idHash: hashId(chatId, secret) };
  if (s.tg) return { idDirect: String(chatId) };
  return {};
}

// Map the text a moderator types (as a reply to a mod message) to a decision.
export function decisionOf(raw) {
  const text = (raw || '').trim();
  if (/^(✅|👍|✔️|sí|si|ok|yes)$/i.test(text)) return 'approve';
  if (/^(🗑|❌|🚫|no)$/i.test(text)) return 'reject';
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
  if (!t) return null;
  if (APPROVE_WORDS.has(t)) return 'approve';
  if (REJECT_WORDS.has(t)) return 'reject';
  return null;
}

export function parseUpdates(updates, ctx, currentOffset = 0) {
  const actions = [];
  let maxId = -1;
  for (const u of updates) {
    if (typeof u.update_id === 'number') maxId = Math.max(maxId, u.update_id);

    const cb = u.callback_query;
    if (cb && cb.message && cb.message.chat) {
      const chatId = cb.message.chat.id;
      if (chatId === ctx.modGroupId) {
        const m = /^(ok|no):(.+)$/.exec(cb.data || '');
        if (m) {
          actions.push({
            kind: m[1] === 'ok' ? 'approve' : 'reject',
            id: m[2], callbackId: cb.id, modMsgId: cb.message.message_id
          });
        }
        continue;
      }
      if (cb.message.chat.type === 'private' && cb.from && cb.from.id === chatId) {
        const m = /^draft:([a-z-]+)(?::([^:]*))?$/.exec(cb.data || '');
        if (m) {
          const act = m[1];
          if (act === 'id' && m[2]) {
            actions.push({ kind: 'draft-id', chatId, callbackId: cb.id,
              draftMsgId: cb.message.message_id, mode: m[2] });
          } else if (['title', 'tags', 'tags-done', 'send', 'cancel'].includes(act)) {
            actions.push({ kind: 'draft-' + act, chatId, callbackId: cb.id,
              draftMsgId: cb.message.message_id });
          }
        }
      }
      continue;
    }

    const msg = u.message;
    if (msg && msg.chat && msg.chat.id === ctx.modGroupId &&
        msg.reply_to_message && msg.reply_to_message.message_id) {
      const id = ctx.modMsgToId && ctx.modMsgToId[msg.reply_to_message.message_id];
      const kind = decisionOf(msg.text);
      if (id && kind) {
        actions.push({ kind, id, modMsgId: msg.reply_to_message.message_id, via: 'reply' });
      }
      continue;
    }
    if (msg && msg.chat && msg.chat.type === 'private') {
      const key = String(msg.chat.id);
      const media = msg.voice || msg.audio;
      if (media && media.file_id) {
        if (media.file_size && media.file_size > MAX_FILE_BYTES) {
          actions.push({ kind: 'draft-invalid', chatId: msg.chat.id, reason: 'size' });
        } else if (media.duration && media.duration > MAX_DURATION_S) {
          actions.push({ kind: 'draft-invalid', chatId: msg.chat.id, reason: 'duration' });
        } else {
          actions.push({
            kind: 'draft', id: 'q_' + u.update_id, chatId: msg.chat.id,
            fileId: media.file_id,
            fromChatId: msg.chat.id, fromMsgId: msg.message_id,
            name: (msg.from && msg.from.first_name) || 'Anónima',
            username: (msg.from && msg.from.username) || '',
            title: (msg.caption || '').trim()
          });
        }
      } else if (msg.text) {
        if (ctx.awaitingTitle && ctx.awaitingTitle[key]) {
          actions.push({ kind: 'draft-title-text', chatId: msg.chat.id, title: (msg.text || '').trim() });
        } else if (ctx.awaitingTags && ctx.awaitingTags[key]) {
          actions.push({ kind: 'draft-tags-text', chatId: msg.chat.id, tagsText: (msg.text || '').trim() });
        } else {
          actions.push({ kind: 'welcome', chatId: msg.chat.id });
        }
      }
    }
  }
  const offset = maxId >= 0 ? maxId + 1 : currentOffset;
  return { actions, offset };
}

export function bancoEntry({ id, name, tags, when, src, t }) {
  // `src` is the absolute audio URL (Cloudinary secure_url). The website composes
  // the license (`by`, `orig`) from `name`; the bot never writes those (see spec §4).
  const e = {
    id,
    name: name || 'Anónima',
    src,
    when
  };
  if (t) e.t = t;
  if (tags) e.tags = tags;
  return e;
}

export function prependClip(banco, entry) {
  return [entry, ...(Array.isArray(banco) ? banco : [])];
}
