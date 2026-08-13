import { readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUpdates, bancoEntry, prependClip } from './logic.mjs';
import { Telegram } from './telegram.mjs';
import { uploadAudio } from './r2.mjs';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const p = (rel) => ROOT + rel;

const readJSON = async (rel, fallback) => {
  try { return JSON.parse(await readFile(p(rel), 'utf8')); } catch { return fallback; }
};
const writeJSON = (rel, v) => writeFile(p(rel), JSON.stringify(v, null, 2) + '\n');
const isoToday = () => new Date().toISOString().slice(0, 10);

const WELCOME_TEXT = 'Graba tu risa (y dale a enviar), elige visibilidad y descríbela, envía, (moderación), recibe notificación de publicación en @risaliberada y risa.liberada.net.';

const BUTTONS = (id) => ({ inline_keyboard: [[
  { text: '✅ Publicar', callback_data: 'ok:' + id },
  { text: '🗑 Borrar',   callback_data: 'no:' + id }
]] });

// Identidad: «Usuario telegram» y «Autor» son multiselect; «Anónimo» los anula (radio).
const DEFAULT_SEL = { tg: false, name: true, anon: false };
const selOf = (d) => d.sel || { ...DEFAULT_SEL };
function displayName(d) {
  const s = selOf(d);
  if (s.anon) return 'Anónima';
  const parts = [];
  if (s.tg) parts.push(d.username ? '@' + d.username : (d.name || 'Anónima'));
  if (s.name) parts.push(d.name || 'Anónima');
  return [...new Set(parts)].join(' · ') || 'Anónima';
}
function identityLabel(d) {
  const s = selOf(d);
  if (s.anon) return '🙈 ' + displayName(d);
  if (s.tg) return '👤 ' + displayName(d);
  return '🙂 ' + displayName(d);
}

// Etiquetas como hashtags (buscables en Telegram) para la descripción del audio.
function tagsHash(tags) {
  return (tags || []).map(t => '#' + t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).join(' ');
}
// Añade palabras escritas por el usuario a d.tags (separadas por coma o espacio).
function addTags(d, text) {
  const out = d.tags || [];
  const seen = new Set(out.map(t => t.toLowerCase()));
  String(text || '').split(/[;,]/).forEach(chunk =>
    chunk.split(/\s+/).forEach(word => {
      const w = word.replace(/^#/, '').trim().toLowerCase();
      if (!w) return;
      if (!seen.has(w)) { seen.add(w); out.push(w); }
    }));
  d.tags = out;
}

// Texto + teclado del borrador: Título + Tags en una fila, identidad en otra, Enviar en la tercera.
function draftText(d) {
  return [
    '🎵 Risa recibida 💛',
    '',
    '✏️ ' + (d.title || '—'),
    '🏷️ ' + ((d.tags && d.tags.length) ? d.tags.join(', ') : '—'),
    identityLabel(d),
    '',
    'Ajusta lo que quieras y pulsa «Enviar».'
  ].join('\n');
}

function OPTIONS(d) {
  const s = selOf(d);
  const mk = (mode, base) => ({
    text: (s[mode] ? '✓ ' : '') + base,
    callback_data: 'draft:id:' + mode
  });
  return { inline_keyboard: [
    [{ text: '✏️ Título', callback_data: 'draft:title' },
     { text: '🏷️ Tags', callback_data: 'draft:tags' }],
    [mk('tg', '👤 Usuario telegram'), mk('name', '🙂 Autor'), mk('anon', '🙈 Anónimo')],
    [{ text: '✅ Enviar', callback_data: 'draft:send' }]
  ]};
}

const CANCEL_KEYS = () => ({ inline_keyboard: [[
  { text: '✖️ Cancelar', callback_data: 'draft:cancel' }
]] });

// Editor de etiquetas: solo texto libre (separado por comas).
function tagsText(d) {
  return '🏷️ Etiqueta tu risa — escribe las etiquetas separadas por coma.\n\n' +
    'Actuales: ' + ((d.tags && d.tags.length) ? d.tags.join(', ') : '—');
}
function tagsKeys() {
  return { inline_keyboard: [[
    { text: '✅ Listo', callback_data: 'draft:tags-done' },
    { text: '✖️ Cancelar', callback_data: 'draft:cancel' }
  ]] };
}

// Answering the callback is cosmetic — never let it block the real work.
const bestEffort = (promise) => promise.catch((err) => console.error('non-fatal:', err.message));

const LOOP_MAX_MS = 55 * 60 * 1000;   // one workflow run covers most of the hour
const POLL_TIMEOUT = 25;              // seconds of long polling per getUpdates

// Download -> loudnorm -> R2 -> banco -> channel. Returns the new banco array.
async function publishClip(tg, cfg, q, id, banco) {
  const filePath = await tg.getFilePath(q.fileId);
  const oga = join(tmpdir(), id + '.oga');
  const mp3 = join(tmpdir(), id + '.mp3');
  try {
    await tg.downloadFile(filePath, oga);
    await run('ffmpeg', ['-y', '-i', oga, '-af', 'loudnorm', '-codec:a', 'libmp3lame', '-q:a', '4', mp3]);
    const src = await uploadAudio(mp3, { publicId: id, folder: cfg.r2Folder });
    const name = q.name || 'Anónima';
    banco = prependClip(banco, bancoEntry({
      id, name, t: q.title, tags: (q.tags || []).join(', '), when: isoToday(), src
    }));
    const caption = [q.title, tagsHash(q.tags), name].filter(Boolean).join(' · ');
    const posted = await tg.sendAudioByUrl(cfg.channel, src, caption, { title: q.title, performer: name });
    if (posted && posted.message_id) {
      await bestEffort(tg.setMessageReaction(cfg.channel, posted.message_id, '😂'));
    }
  } finally {
    await rm(oga, { force: true });
    await rm(mp3, { force: true });
  }
  return banco;
}

// Apply one action. Every handler is idempotent (safe when updates re-deliver after
// an offset rollback). Returns { banco, dirty } — dirty tells the caller to persist+commit.
async function handleAction(a, tg, cfg, queue, drafts, banco) {
  if (a.kind === 'draft') {
    const key = String(a.chatId);
    const prev = drafts[key] || {};
    drafts[key] = {
      id: a.id, fileId: a.fileId, name: a.name, username: a.username,
      title: a.title || '', tags: [], sel: { ...DEFAULT_SEL },
      fromChatId: a.fromChatId, fromMsgId: a.fromMsgId,
      draftMsgId: prev.draftMsgId, awaitingTitle: false, awaitingTags: false
    };
    const text = draftText(drafts[key]);
    if (prev.draftMsgId) {
      await bestEffort(tg.editMessageText(a.chatId, prev.draftMsgId, text, OPTIONS(drafts[key])));
    } else {
      const sent = await tg.sendMessage(a.chatId, text, OPTIONS(drafts[key]));
      drafts[key].draftMsgId = sent.message_id;
    }
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-title') {
    const d = drafts[String(a.chatId)];
    if (!d) return { banco, dirty: false };
    d.awaitingTitle = true;
    d.awaitingTags = false;
    await bestEffort(tg.answerCallback(a.callbackId, 'Escribe el título'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId,
      '✏️ Escribe el título de tu risa (una palabra o frase corta):', CANCEL_KEYS()));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-title-text') {
    const d = drafts[String(a.chatId)];
    if (!d || !d.awaitingTitle) return { banco, dirty: false };
    d.title = (a.title || '').slice(0, 60);
    d.awaitingTitle = false;
    await bestEffort(tg.editMessageText(a.chatId, d.draftMsgId, draftText(d), OPTIONS(d)));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-tags') {
    const d = drafts[String(a.chatId)];
    if (!d) return { banco, dirty: false };
    d.awaitingTitle = false;
    d.awaitingTags = true;
    await bestEffort(tg.answerCallback(a.callbackId, 'Etiqueta tu risa'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, tagsText(d), tagsKeys()));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-tags-text') {
    const d = drafts[String(a.chatId)];
    if (!d || !d.awaitingTags) return { banco, dirty: false };
    addTags(d, a.tagsText);
    await bestEffort(tg.editMessageText(a.chatId, d.draftMsgId, tagsText(d), tagsKeys()));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-tags-done') {
    const d = drafts[String(a.chatId)];
    if (!d) return { banco, dirty: false };
    d.awaitingTags = false;
    await bestEffort(tg.answerCallback(a.callbackId, 'Etiquetas guardadas'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, draftText(d), OPTIONS(d)));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-id') {
    const d = drafts[String(a.chatId)];
    if (!d) return { banco, dirty: false };
    const s = selOf(d);
    if (a.mode === 'anon') { s.tg = false; s.name = false; s.anon = true; }
    else if (a.mode === 'tg') { s.tg = !s.tg; s.anon = false; }
    else if (a.mode === 'name') { s.name = !s.name; s.anon = false; }
    await bestEffort(tg.answerCallback(a.callbackId, 'Autor: ' + displayName(d)));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, draftText(d), OPTIONS(d)));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-cancel') {
    const d = drafts[String(a.chatId)];
    if (!d) return { banco, dirty: false };
    d.awaitingTitle = false;
    d.awaitingTags = false;
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, draftText(d), OPTIONS(d)));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-send') {
    const d = drafts[String(a.chatId)];
    if (!d) { await bestEffort(tg.answerCallback(a.callbackId, 'Nada que enviar')); return { banco, dirty: false }; }
    if (queue[d.id] || banco.some((e) => e.id === d.id)) { delete drafts[String(a.chatId)]; return { banco, dirty: true }; }
    const name = displayName(d);
    const caption = [
      d.title || '',
      tagsHash(d.tags),
      name
    ].filter(Boolean).join('\n');
    const copied = await tg.copyMessage(cfg.modGroupId, d.fromChatId, d.fromMsgId, BUTTONS(d.id), caption);
    queue[d.id] = { fileId: d.fileId, name, username: d.username, title: d.title,
                    tags: d.tags || [], sel: d.sel || { ...DEFAULT_SEL },
                    uploaderChatId: a.chatId, modMsgId: copied.message_id };
    delete drafts[String(a.chatId)];
    await bestEffort(tg.answerCallback(a.callbackId, 'Enviada a moderación'));
    await bestEffort(tg.sendMessage(a.chatId,
      'Gracias, lo revisamos en breve y te avisamos cuando se publique.'));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-invalid') {
    const msg = a.reason === 'size'
      ? 'Ups… tu archivo supera el límite de 10 MB. Mándalo en un formato más ligero 💛'
      : 'Ups… tu risa supera el límite de 1000 segundos. Mándala más cortita 💛';
    await bestEffort(tg.sendMessage(a.chatId, msg));
    return { banco, dirty: false };
  }
  if (a.kind === 'welcome') {
    await bestEffort(tg.sendMessage(a.chatId, WELCOME_TEXT));
    return { banco, dirty: false };
  }
  if (a.kind === 'approve') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, q ? 'Publicando…' : 'Ya resuelta'));
    if (!q) return { banco, dirty: false };
    if (banco.some((e) => e.id === a.id)) { delete queue[a.id]; return { banco, dirty: true }; }
    if (!q.fileId) throw new Error('queue entry missing fileId for ' + a.id);
    banco = await publishClip(tg, cfg, q, a.id, banco);
    delete queue[a.id];
    await bestEffort(tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId));
    await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, '✅ Publicado'));
    if (q.uploaderChatId) {
      const lines = ['✅ ¡Tu risa ya está publicada!'];
      if (q.title) lines.push('✏️ ' + q.title);
      if (q.tags && q.tags.length) lines.push('🏷️ ' + q.tags.join(', '));
      lines.push('🙂 ' + (q.name || 'Anónima'));
      lines.push('📣 Grupo Risa liberada: ' + cfg.groupUrl);
      await bestEffort(tg.sendMessage(q.uploaderChatId, lines.join('\n')));
    }
    return { banco, dirty: true };
  }
  if (a.kind === 'reject') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, 'Borrada'));
    if (q) {
      await bestEffort(tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId));
      await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, '🗑 Borrada'));
      delete queue[a.id];
    }
    return { banco, dirty: !!q };
  }
  return { banco, dirty: false };
}

// Persist risa.json + state/ and push, so the web sees new clips in real time
// instead of waiting for the workflow's own commit step.
async function commitState() {
  const { stdout } = await run('git', ['status', '--porcelain']);
  if (!stdout.trim()) return;
  const who = ['-c', 'user.name=banco-risa bot', '-c', 'user.email=bot@users.noreply.github.com'];
  await run('git', [...who, 'add', 'risa.json', 'state/']);
  await run('git', [...who, 'commit', '-m', 'banco: publish/moderate (automated)']);
  const token = process.env.GITHUB_TOKEN;
  const remote = token
    ? `https://x-access-token:${token}@github.com/floveorg/banco-risa.git`
    : 'origin';
  try {
    await run('git', ['pull', '--rebase', 'origin', 'main']);
    await run('git', ['push', remote, 'HEAD:main']);
  } catch {
    await run('git', ['pull', '--rebase', 'origin', 'main']);
    await run('git', ['push', remote, 'HEAD:main']);
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const cfg = await readJSON('config.json', {});
  if (!cfg.modGroupId) throw new Error('config.json modGroupId not set (run Task 6)');
  const tg = Telegram(token);

  let offset = parseInt(await readFile(p('state/offset.txt'), 'utf8'), 10) || 0;
  let queue = await readJSON('state/queue.json', {});
  let drafts = await readJSON('state/drafts.json', {});
  let banco = await readJSON('risa.json', []);

  const startedAt = Date.now();
  while (Date.now() - startedAt < LOOP_MAX_MS) {
    const modMsgToId = Object.fromEntries(
      Object.entries(queue).map(([id, e]) => [e.modMsgId, id]));
    const awaitingTitle = Object.fromEntries(
      Object.entries(drafts).filter(([, d]) => d.awaitingTitle));
    const awaitingTags = Object.fromEntries(
      Object.entries(drafts).filter(([, d]) => d.awaitingTags));
    const updates = await tg.getUpdates(offset, POLL_TIMEOUT);
    const { actions, offset: nextOffset } = parseUpdates(
      updates, { modGroupId: cfg.modGroupId, modMsgToId, awaitingTitle, awaitingTags }, offset);

    for (const a of actions) {
      try {
        const r = await handleAction(a, tg, cfg, queue, drafts, banco);
        banco = r.banco;
        if (r.dirty) {
          await writeJSON('state/queue.json', queue);
          await writeJSON('state/drafts.json', drafts);
          await writeJSON('risa.json', banco);
          await bestEffort(commitState());
        }
      } catch (err) {
        console.error('action failed', a.id, a.kind, err.message);
      }
    }

    if (nextOffset !== offset) {
      offset = nextOffset;
      await writeFile(p('state/offset.txt'), String(offset) + '\n');
    }
    if (actions.length) {
      console.log(`processed ${actions.length} action(s); offset ${offset}; banco ${banco.length}`);
    }
  }

  await writeJSON('state/queue.json', queue);
  await writeJSON('state/drafts.json', drafts);
  await writeJSON('risa.json', banco);
  await writeFile(p('state/offset.txt'), String(offset) + '\n');
  await bestEffort(commitState());
}

main().catch((e) => { console.error(e); process.exit(1); });
