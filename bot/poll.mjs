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

const WELCOME_TEXT = 'Actívame para compartir tu risa con el mundo, de forma anónima o con tu identidad.';
const SUGGESTED_TAGS = ['loca', 'grupo', 'niños', 'contagiosa', 'familiar', 'breve', 'musical', 'carcajada'];

const BUTTONS = (id) => ({ inline_keyboard: [[
  { text: '✅ Publicar', callback_data: 'ok:' + id },
  { text: '🗑 Borrar',   callback_data: 'no:' + id }
]] });

// Identidad de 3 vías: 1. Usuario telegram · 2. Nombre perfil · 3. Anónimo.
function displayName(d) {
  if (d.identity === 'tg') return d.username ? '@' + d.username : (d.name || 'Anónima');
  if (d.identity === 'anon') return 'Anónima';
  return d.name || 'Anónima';
}
function identityLabel(d) {
  if (d.identity === 'tg') return '👤 ' + displayName(d);
  if (d.identity === 'anon') return '🙈 ' + displayName(d);
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
    '✏️ Título: ' + (d.title || '—'),
    '🏷️ Etiquetas: ' + ((d.tags && d.tags.length) ? d.tags.join(', ') : '—'),
    '🙂 Nombre: ' + identityLabel(d),
    '',
    'Ajusta lo que quieras y pulsa «Enviar a moderación».'
  ].join('\n');
}

function OPTIONS(d) {
  const mk = (mode, base) => ({
    text: (d.identity === mode ? '✓ ' : '') + base,
    callback_data: 'draft:id:' + mode
  });
  return { inline_keyboard: [
    [{ text: '✏️ Título', callback_data: 'draft:title' },
     { text: '🏷️ Tags', callback_data: 'draft:tags' }],
    [mk('tg', '👤 Usuario telegram'), mk('name', '🙂 Nombre perfil'), mk('anon', '🙈 Anónimo')],
    [{ text: '✅ Enviar a moderación', callback_data: 'draft:send' }]
  ]};
}

const CANCEL_KEYS = () => ({ inline_keyboard: [[
  { text: '✖️ Cancelar', callback_data: 'draft:cancel' }
]] });

// Editor de etiquetas: sugerencias clicables + campo para añadir (escribir texto).
function tagsText(d) {
  return '🏷️ Etiqueta tu risa — toca las que encajen o escribe las tuyas (separadas por coma).\n\n' +
    'Actuales: ' + ((d.tags && d.tags.length) ? d.tags.join(', ') : '—');
}
function tagsKeys(d) {
  const selected = new Set((d.tags || []).map(t => t.toLowerCase()));
  const rows = [];
  let row = [];
  SUGGESTED_TAGS.forEach(tag => {
    const on = selected.has(tag.toLowerCase());
    row.push({ text: (on ? '✓ ' : '') + tag, callback_data: 'draft:tag:' + tag });
    if (row.length === 3) { rows.push(row); row = []; }
  });
  if (row.length) rows.push(row);
  rows.push([{ text: '✅ Listo', callback_data: 'draft:tags-done' },
             { text: '✖️ Cancelar', callback_data: 'draft:cancel' }]);
  return { inline_keyboard: rows };
}

// Answering the callback is cosmetic — never let it block the real work.
const bestEffort = (promise) => promise.catch((err) => console.error('non-fatal:', err.message));

const LOOP_MAX_MS = 55 * 60 * 1000;   // one workflow run covers most of the hour
const POLL_TIMEOUT = 25;              // seconds of long polling per getUpdates
const AUTO_PUBLISH_MS = 15 * 60 * 1000; // auto-publish clips nobody decided on (trusted group)

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
    const caption = [q.title, tagsHash(q.tags), name, 'CC BY-SA 4.0'].filter(Boolean).join(' · ');
    const posted = await tg.sendAudioByUrl(cfg.channel, src, caption);
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
      title: a.title || '', tags: [], identity: 'name',
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
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, tagsText(d), tagsKeys(d)));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-tag-toggle') {
    const d = drafts[String(a.chatId)];
    if (!d || !d.awaitingTags) return { banco, dirty: false };
    const arr = d.tags || [];
    const i = arr.findIndex(t => t.toLowerCase() === a.tag.toLowerCase());
    if (i >= 0) arr.splice(i, 1); else arr.push(a.tag.toLowerCase());
    d.tags = arr;
    await bestEffort(tg.answerCallback(a.callbackId, arr.length ? 'Etiquetas: ' + arr.join(', ') : 'Sin etiquetas'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, tagsText(d), tagsKeys(d)));
    return { banco, dirty: true };
  }
  if (a.kind === 'draft-tags-text') {
    const d = drafts[String(a.chatId)];
    if (!d || !d.awaitingTags) return { banco, dirty: false };
    addTags(d, a.tagsText);
    await bestEffort(tg.editMessageText(a.chatId, d.draftMsgId, tagsText(d), tagsKeys(d)));
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
    d.identity = (['tg', 'name', 'anon'].includes(a.mode)) ? a.mode : 'name';
    await bestEffort(tg.answerCallback(a.callbackId, 'Nombre: ' + displayName(d)));
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
      d.title ? 'Título: ' + d.title : '',
      tagsHash(d.tags),
      'Por: ' + name
    ].filter(Boolean).join('\n');
    const copied = await tg.copyMessage(cfg.modGroupId, d.fromChatId, d.fromMsgId, BUTTONS(d.id), caption);
    queue[d.id] = { fileId: d.fileId, name, username: d.username, title: d.title,
                    tags: d.tags || [], identity: d.identity || 'name',
                    uploaderChatId: a.chatId, modMsgId: copied.message_id, ts: Date.now() };
    delete drafts[String(a.chatId)];
    await bestEffort(tg.answerCallback(a.callbackId, 'Enviada a moderación'));
    await bestEffort(tg.sendMessage(a.chatId,
      '¡Enviada a moderación! 💛 Se publica sola en un momento; los moderadores pueden frenarla si no procede.'));
    return { banco, dirty: true };
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
      if (q.title) lines.push('✏️ Título: ' + q.title);
      if (q.tags && q.tags.length) lines.push('🏷️ Etiquetas: ' + q.tags.join(', '));
      lines.push('🙂 Nombre: ' + (q.name || 'Anónima'));
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

// Persist banco.json + state/ and push, so the web sees new clips in real time
// instead of waiting for the workflow's own commit step.
async function commitState() {
  const { stdout } = await run('git', ['status', '--porcelain']);
  if (!stdout.trim()) return;
  const who = ['-c', 'user.name=banco-risa bot', '-c', 'user.email=bot@users.noreply.github.com'];
  await run('git', [...who, 'add', 'banco.json', 'state/']);
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
  let banco = await readJSON('banco.json', []);
  for (const e of Object.values(queue)) if (!e.ts) e.ts = Date.now(); // legacy entries

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

    // Trusted mod group: clips nobody decided on within the grace period publish on their own.
    for (const id of Object.keys(queue)) {
      if (Date.now() - (queue[id].ts || 0) > AUTO_PUBLISH_MS) {
        actions.push({ kind: 'approve', id, via: 'auto' });
      }
    }

    for (const a of actions) {
      try {
        const r = await handleAction(a, tg, cfg, queue, drafts, banco);
        banco = r.banco;
        if (r.dirty) {
          await writeJSON('state/queue.json', queue);
          await writeJSON('state/drafts.json', drafts);
          await writeJSON('banco.json', banco);
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
  await writeJSON('banco.json', banco);
  await writeFile(p('state/offset.txt'), String(offset) + '\n');
  await bestEffort(commitState());
}

main().catch((e) => { console.error(e); process.exit(1); });
