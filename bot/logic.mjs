// Pure logic: Telegram getUpdates -> ordered actions + new offset. No I/O.

const APPROVE_WORDS = new Set(['ok', 'si', 'sí', 'yes', 'publicar', 'publish', 'dale', 'adelante', 'aprobado', 'subir', 'listo']);
const REJECT_WORDS = new Set(['no', 'borrar', 'delete', 'rechazar', 'quitar', 'fuera', 'cancelar', 'anular']);

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
          if (act === 'tag' && m[2]) {
            actions.push({ kind: 'draft-tag-toggle', chatId, callbackId: cb.id,
              draftMsgId: cb.message.message_id, tag: m[2] });
          } else if (act === 'id' && m[2]) {
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
        actions.push({
          kind: 'draft', id: 'q_' + u.update_id, chatId: msg.chat.id,
          fileId: media.file_id,
          fromChatId: msg.chat.id, fromMsgId: msg.message_id,
          name: (msg.from && msg.from.first_name) || 'Anónima',
          username: (msg.from && msg.from.username) || '',
          title: (msg.caption || '').trim()
        });
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
