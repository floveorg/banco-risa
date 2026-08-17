import { readFile, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseUpdates, risaEntry, prependClip, identityOf, hashId, MAX_FILE_BYTES,
  latestClips, clipsOfAuthor, clipsToday, clipsSince, randomClip,
  tagTrend, authorStats, searchClips, inlineResult
} from './logic.mjs';
import { pageUrlOf } from './pages.mjs';
import { Telegram } from './telegram.mjs';
import { uploadAudio, uploadMedia } from './r2.mjs';

// Salt for the obfuscated Telegram-id hash. Each deployer sets their own; the
// default keeps the hash one-way (never reversible) but sharing it across
// installs is fine too — it is not a password.
const TG_ID_SECRET = process.env.TG_ID_SECRET || 'risa-dev-secret';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const p = (rel) => ROOT + rel;

const readJSON = async (rel, fallback) => {
  try { return JSON.parse(await readFile(p(rel), 'utf8')); } catch { return fallback; }
};
const writeJSON = (rel, v) => writeFile(p(rel), JSON.stringify(v, null, 2) + '\n');
const isoToday = () => new Date().toISOString().slice(0, 10);

const WELCOME_TEXT = 'Audios o vídeos de máx. 1 min, 10 MB, 5 al día. Graba y envía el tuyo: elige visibilidad, descríbelo y pulsa Enviar. Un moderador lo revisa y, si entra, lo publicamos en @risaliberada y en risa.liberada.net 💛';

// Anti-abuso (frecuencia): máx. risas en cola y máx. por día y remitente. El
// remitente se identifica por el hash de su id de Telegram (nunca en claro).
const LIMITS_DEFAULTS = { maxFileBytes: 10 * 1024 * 1024, maxDurationS: 60, maxPending: 5, maxPerDay: 5 };

const BUTTONS = (id) => ({ inline_keyboard: [[
  { text: '✅ Publicar', callback_data: 'ok:' + id },
  { text: '🗑 Borrar',   callback_data: 'no:' + id }
], [
  { text: '✏️ Editar', callback_data: 'edit:' + id }
]] });

// El moderador puede ajustar los detalles (título, tags, nombre) antes de
// publicar, pero el autor original tiene la última palabra: acepta o rechaza.
const EDIT_PROMPT_KEYS = (id) => ({ inline_keyboard: [[
  { text: '✖️ Cancelar', callback_data: 'edit-cancel:' + id }
]] });
const EDIT_KEYS = (id) => ({ inline_keyboard: [[
  { text: '📨 Proponer al autor', callback_data: 'edit-send:' + id },
  { text: '✖️ Cancelar', callback_data: 'edit-cancel:' + id }
]] });
const ACCEPT_KEYS = (id) => ({ inline_keyboard: [[
  { text: '✅ Aceptar', callback_data: 'accept:' + id },
  { text: '❌ Rechazar', callback_data: 'reject-edit:' + id }
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

// Detalles que un moderador propone para una risa en cola: una línea
// "Título | Tags | Nombre" (lo que no se toque se conserva).
function parseEditDetails(text) {
  const parts = String(text || '').split('|').map(s => s.trim());
  const out = {};
  if (parts[0]) out.title = parts[0].slice(0, 60);
  const tags = String(parts[1] || '').split(/[;,]/)
    .map(t => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
  if (tags.length) out.tags = tags;
  if (parts[2]) out.name = parts[2].slice(0, 40);
  return out;
}

// Detalles actuales (líneas legibles) para el mensaje de moderación.
function detailLines(q) {
  const tags = q.tags && q.tags.length ? q.tags.join(', ') : '—';
  return ['✏️ ' + (q.title || '—'), '🏷️ ' + tags, '🙂 ' + (q.name || 'Anónima')];
}

// Detalles con la propuesta aplicada encima (para enseñar al autor).
function proposalLines(q) {
  const p = q.proposed || {};
  const tags = (p.tags && p.tags.length)
    ? p.tags.join(', ')
    : ((q.tags && q.tags.length) ? q.tags.join(', ') : '—');
  return ['✏️ ' + (p.title || q.title || '—'),
          '🏷️ ' + tags,
          '🙂 ' + (p.name || q.name || 'Anónima')];
}

// Pie original del mensaje de moderación (se restaura al cancelar la edición).
function modCaption(q) {
  const tags = (q.tags && q.tags.length) ? q.tags.join(', ') : '';
  return [q.title || '', tagsHash(q.tags), q.name || 'Anónima'].filter(Boolean).join('\n');
}

// Línea legible de una risa publicada (para los comandos de consulta).
function clipLine(e) {
  return '🎧 ' + (e.t || '—') + ' · 🙂 ' + (e.name || 'Anónima') + ' · 📅 ' + (e.when || '—');
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

// C19 · Opt-in del @ en la web: se pregunta una vez al primer envío; el enlace
// a t.me solo aparece si el autor dice que sí. Se puede volver a preguntar con /pub.
const TGPUB_TEXT = '📣 ¿Mostrar tu @ en la web?\n\n' +
  'Risa nunca enlaza tu Telegram automáticamente: solo si tú lo pides, junto a ' +
  'tu nombre público aparecerá un enlace a t.me. Puedes cambiarlo luego con /pub.';
const TGPUB_KEYS = () => ({ inline_keyboard: [[
  { text: '✅ Sí, mostrar mi @', callback_data: 'tgpub:yes' },
  { text: '✖️ No', callback_data: 'tgpub:no' }
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

// Download -> encode (MP3 audio / MP4 vídeo comprimido) -> R2 -> risas -> channel.
// Returns the new risas array.
async function publishClip(tg, cfg, q, id, risas, names, tgpub) {
  const filePath = await tg.getFilePath(q.fileId);
  const srcRaw = join(tmpdir(), id + '.vsrc');
  const out = join(tmpdir(), id + (q.video ? '.mp4' : '.mp3'));
  try {
    await tg.downloadFile(filePath, srcRaw);
    let src, posted;
    if (q.video) {
      // Compresión solo para vídeo: MP4 H.264 + AAC. Si no cabe en 10 MB,
      // re-encode más agresivo (menor CRF + escala) hasta que quepa.
      const aac = ['-c:a', 'aac', '-movflags', '+faststart'];
      await run('ffmpeg', ['-y', '-i', srcRaw, '-c:v', 'libx264', '-preset', 'veryfast',
        '-crf', '26', '-pix_fmt', 'yuv420p', ...aac, '-b:a', '96k', out]);
      if ((await stat(out)).size > MAX_FILE_BYTES) {
        await run('ffmpeg', ['-y', '-i', srcRaw, '-c:v', 'libx264', '-preset', 'veryfast',
          '-crf', '33', '-pix_fmt', 'yuv420p', '-vf', 'scale=min(960,iw):-2',
          ...aac, '-b:a', '64k', out]);
      }
      src = await uploadMedia(out, { key: (cfg.r2Folder ? cfg.r2Folder + '/' : '') + id + '.mp4', contentType: 'video/mp4' });
    } else {
      await run('ffmpeg', ['-y', '-i', srcRaw, '-vn', '-af', 'loudnorm', '-codec:a', 'libmp3lame', '-q:a', '4', out]);
      src = await uploadAudio(out, { publicId: id, folder: cfg.r2Folder });
    }
    const who = q.uploader;
    const name = (who && names && names[who]) || q.name || 'Anónima';
    const tgLink = (who && tgpub && tgpub[who] && tgpub[who].ok) ? tgpub[who].username : undefined;
    risas = prependClip(risas, risaEntry({
      id, name, key: who, t: q.title, tags: (q.tags || []).join(', '), when: isoToday(), src, tg: tgLink, video: !!q.video
    }));
    const caption = [q.title, tagsHash(q.tags), name].filter(Boolean).join(' · ');
    if (q.video) {
      posted = await tg.sendVideoByUrl(cfg.channel, src, caption);
    } else {
      posted = await tg.sendAudioByUrl(cfg.channel, src, caption, { title: q.title, performer: name });
    }
    if (posted && posted.message_id) {
      await bestEffort(tg.setMessageReaction(cfg.channel, posted.message_id, '😂'));
    }
  } finally {
    await rm(srcRaw, { force: true });
    await rm(out, { force: true });
  }
  return risas;
}

// Apply one action. Every handler is idempotent (safe when updates re-deliver after
// an offset rollback). Returns { risas, dirty } — dirty tells the caller to persist+commit.
async function handleAction(a, tg, cfg, queue, drafts, risas, uploaders, uploads, tgpub, names) {
  const limits = cfg.limits || {};
  if (a.kind === 'draft') {
    const key = String(a.chatId);
    const prev = drafts[key] || {};
    drafts[key] = {
      id: a.id, fileId: a.fileId, name: a.name, username: a.username, video: !!a.video,
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
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-title') {
    const d = drafts[String(a.chatId)];
    if (!d) return { risas, dirty: false };
    d.awaitingTitle = true;
    d.awaitingTags = false;
    await bestEffort(tg.answerCallback(a.callbackId, 'Escribe el título'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId,
      '✏️ Escribe el título de tu risa (una palabra o frase corta):', CANCEL_KEYS()));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-title-text') {
    const d = drafts[String(a.chatId)];
    if (!d || !d.awaitingTitle) return { risas, dirty: false };
    d.title = (a.title || '').slice(0, 60);
    d.awaitingTitle = false;
    await bestEffort(tg.editMessageText(a.chatId, d.draftMsgId, draftText(d), OPTIONS(d)));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-tags') {
    const d = drafts[String(a.chatId)];
    if (!d) return { risas, dirty: false };
    d.awaitingTitle = false;
    d.awaitingTags = true;
    await bestEffort(tg.answerCallback(a.callbackId, 'Etiqueta tu risa'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, tagsText(d), tagsKeys()));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-tags-text') {
    const d = drafts[String(a.chatId)];
    if (!d || !d.awaitingTags) return { risas, dirty: false };
    addTags(d, a.tagsText);
    await bestEffort(tg.editMessageText(a.chatId, d.draftMsgId, tagsText(d), tagsKeys()));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-tags-done') {
    const d = drafts[String(a.chatId)];
    if (!d) return { risas, dirty: false };
    d.awaitingTags = false;
    await bestEffort(tg.answerCallback(a.callbackId, 'Etiquetas guardadas'));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, draftText(d), OPTIONS(d)));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-id') {
    const d = drafts[String(a.chatId)];
    if (!d) return { risas, dirty: false };
    const s = selOf(d);
    if (a.mode === 'anon') { s.tg = false; s.name = false; s.anon = true; }
    else if (a.mode === 'tg') { s.tg = !s.tg; s.anon = false; }
    else if (a.mode === 'name') { s.name = !s.name; s.anon = false; }
    await bestEffort(tg.answerCallback(a.callbackId, 'Autor: ' + displayName(d)));
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, draftText(d), OPTIONS(d)));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-cancel') {
    const d = drafts[String(a.chatId)];
    if (!d) return { risas, dirty: false };
    d.awaitingTitle = false;
    d.awaitingTags = false;
    await bestEffort(tg.editMessageText(a.chatId, a.draftMsgId, draftText(d), OPTIONS(d)));
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-send') {
    const d = drafts[String(a.chatId)];
    if (!d) { await bestEffort(tg.answerCallback(a.callbackId, 'Nada que enviar')); return { risas, dirty: false }; }
    if (queue[d.id] || risas.some((e) => e.id === d.id)) { delete drafts[String(a.chatId)]; return { risas, dirty: true }; }
    const who = hashId(a.chatId, TG_ID_SECRET);
    const today = isoToday();
    const day = uploads[today] || (uploads[today] = {});
    if ((day[who] || 0) >= limits.maxPerDay) {
      await bestEffort(tg.answerCallback(a.callbackId, 'Límite diario alcanzado'));
      await bestEffort(tg.sendMessage(a.chatId,
        'Ya has enviado ' + limits.maxPerDay + ' risas hoy. Vuelve mañana 💛'));
      return { risas, dirty: false };
    }
    const pending = Object.values(queue).filter((e) => e.uploader === who).length;
    if (pending >= limits.maxPending) {
      await bestEffort(tg.answerCallback(a.callbackId, 'Cola llena'));
      await bestEffort(tg.sendMessage(a.chatId,
        'Ya tienes ' + limits.maxPending + ' risas en moderación. Espera a que se publiquen o borren antes de enviar más 💛'));
      return { risas, dirty: false };
    }
    const name = displayName(d);
    const caption = [
      d.title || '',
      tagsHash(d.tags),
      name
    ].filter(Boolean).join('\n');
    const copied = await tg.copyMessage(cfg.modGroupId, d.fromChatId, d.fromMsgId, BUTTONS(d.id), caption);
    queue[d.id] = { fileId: d.fileId, name, username: d.username, title: d.title, video: !!d.video,
                    tags: d.tags || [], sel: d.sel || { ...DEFAULT_SEL },
                    uploader: who,
                    ...identityOf(d.sel, a.chatId, TG_ID_SECRET), modMsgId: copied.message_id };
    day[who] = (day[who] || 0) + 1;
    uploaders[d.id] = a.chatId;
    delete drafts[String(a.chatId)];
    await bestEffort(tg.answerCallback(a.callbackId, 'Enviada a moderación'));
    await bestEffort(tg.sendMessage(a.chatId,
      'Gracias, lo revisamos en breve y te avisamos cuando se publique.'));
    const entry = queue[d.id];
    if (entry.idHash && !tgpub[who]) {
      await bestEffort(tg.sendMessage(a.chatId, TGPUB_TEXT, TGPUB_KEYS()));
    }
    return { risas, dirty: true };
  }
  if (a.kind === 'draft-invalid') {
    const msg = a.reason === 'size'
      ? 'Ups… tu archivo supera el límite de 10 MB. Mándalo en un formato más ligero 💛'
      : 'Ups… tu risa supera el minuto. Mándala más cortita 💛';
    await bestEffort(tg.sendMessage(a.chatId, msg));
    return { risas, dirty: false };
  }
  if (a.kind === 'welcome') {
    await bestEffort(tg.sendMessage(a.chatId, WELCOME_TEXT));
    return { risas, dirty: false };
  }
  if (a.kind === 'rename') {
    const who = hashId(a.chatId, TG_ID_SECRET);
    const n = (a.name || '').trim();
    if (!n) {
      await bestEffort(tg.sendMessage(a.chatId, 'Uso: /name <tu nombre público>'));
      return { risas, dirty: false };
    }
    names[who] = n;
    await bestEffort(tg.sendMessage(a.chatId,
      'Nombre público guardado: ' + n + ' — se aplica a tus próximas risas publicadas.'));
    return { risas, dirty: true };
  }
  if (a.kind === 'tgpub-ask') {
    await bestEffort(tg.sendMessage(a.chatId, TGPUB_TEXT, TGPUB_KEYS()));
    return { risas, dirty: false };
  }
  if (a.kind === 'tgpub-yes' || a.kind === 'tgpub-no') {
    const who = hashId(a.chatId, TG_ID_SECRET);
    const yes = a.kind === 'tgpub-yes';
    tgpub[who] = { ok: yes, username: a.username ? '@' + a.username : '' };
    await bestEffort(tg.answerCallback(a.callbackId,
      yes ? 'Tu @ se mostrará junto a tu nombre' : 'Perfecto, tu @ quedará oculto'));
    return { risas, dirty: true };
  }
  if (a.kind === 'approve') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, q ? 'Publicando…' : 'Ya resuelta'));
    if (!q) return { risas, dirty: false };
    if (q.pendingAccept) {
      await bestEffort(tg.answerCallback(a.callbackId,
        'La risa está esperando el visto bueno del autor — resuélvelo antes'));
      return { risas, dirty: false };
    }
    if (risas.some((e) => e.id === a.id)) { delete queue[a.id]; return { risas, dirty: true }; }
    if (!q.fileId) throw new Error('queue entry missing fileId for ' + a.id);
    risas = await publishClip(tg, cfg, q, a.id, risas, names, tgpub);
    delete queue[a.id];
    await bestEffort(tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId));
    await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, '✅ Publicado'));
    const upChatId = uploaders[a.id];
    if (upChatId) {
      const lines = ['✅ ¡Tu risa ya está publicada!'];
      if (q.title) lines.push('✏️ ' + q.title);
      if (q.tags && q.tags.length) lines.push('🏷️ ' + q.tags.join(', '));
      lines.push('🙂 ' + (q.name || 'Anónima'));
      lines.push('🔗 Tu página de autor: ' + pageUrlOf(q.uploader, cfg.webUrl));
      lines.push('📣 Grupo Risa liberada: ' + cfg.groupUrl);
      await bestEffort(tg.sendMessage(upChatId, lines.join('\n')));
      delete uploaders[a.id];
    }
    return { risas, dirty: true };
  }
  if (a.kind === 'reject') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, 'Borrada'));
    if (q) {
      q.editing = false; q.proposed = undefined; q.pendingAccept = false;
      await bestEffort(tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId));
      await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, '🗑 Borrada'));
      delete queue[a.id];
      delete uploaders[a.id];
    }
    return { risas, dirty: !!q };
  }
  if (a.kind === 'mod-edit') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, q ? 'Editando…' : 'Ya resuelta'));
    if (!q) return { risas, dirty: false };
    q.editing = true;
    q.proposed = undefined;
    await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId,
      '✏️ Editando — manda los detalles en una línea:\nTítulo | Tags | Nombre\n\nActuales:\n' +
      detailLines(q).join('\n')));
    await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, EDIT_PROMPT_KEYS(a.id)));
    return { risas, dirty: true };
  }
  if (a.kind === 'mod-edit-text') {
    const q = queue[a.id];
    if (!q) return { risas, dirty: false };
    const prop = parseEditDetails(a.text);
    if (!Object.keys(prop).length) {
      await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId,
        'Nada que proponer — usa el formato: Título | Tags | Nombre'));
      await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, EDIT_PROMPT_KEYS(a.id)));
      return { risas, dirty: true };
    }
    q.proposed = prop;
    q.editing = false;
    await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId,
      '✏️ Propuesta:\n\n' + proposalLines(q).join('\n') +
      '\n\n¿La enviamos al autor para su visto bueno?'));
    await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, EDIT_KEYS(a.id)));
    return { risas, dirty: true };
  }
  if (a.kind === 'mod-edit-send') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, q ? 'Enviando propuesta…' : 'Ya resuelta'));
    if (!q) return { risas, dirty: false };
    const upChatId = uploaders[a.id];
    if (!upChatId) {
      q.editing = false; q.proposed = undefined;
      await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId,
        'No encuentro al autor para el visto bueno — propuesta cancelada.'));
      await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, BUTTONS(a.id)));
      return { risas, dirty: true };
    }
    q.editing = false;
    q.pendingAccept = true;
    await bestEffort(tg.sendMessage(upChatId,
      'Un moderador quiere ajustar tu risa antes de publicarla 💛\n\n' +
      proposalLines(q).join('\n') + '\n\n¿Te vale así?', ACCEPT_KEYS(a.id)));
    await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId,
      '✏️ Propuesta enviada al autor — esperando su visto bueno.'));
    await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, { inline_keyboard: [] }));
    return { risas, dirty: true };
  }
  if (a.kind === 'mod-edit-cancel') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, 'Edición cancelada'));
    if (q) {
      q.editing = false; q.proposed = undefined; q.pendingAccept = false;
      await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, modCaption(q)));
      await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, BUTTONS(a.id)));
    }
    return { risas, dirty: !!q };
  }
  if (a.kind === 'edit-accept') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, q ? 'Publicando…' : 'Ya resuelta'));
    if (!q) return { risas, dirty: false };
    if (risas.some((e) => e.id === a.id)) { delete queue[a.id]; return { risas, dirty: true }; }
    q.editing = false; q.pendingAccept = false;
    if (q.proposed) {
      if (q.proposed.title) q.title = q.proposed.title;
      if (q.proposed.tags) q.tags = q.proposed.tags;
      if (q.proposed.name) q.name = q.proposed.name;
      q.proposed = undefined;
    }
    if (!q.fileId) throw new Error('queue entry missing fileId for ' + a.id);
    risas = await publishClip(tg, cfg, q, a.id, risas, names, tgpub);
    delete queue[a.id];
    await bestEffort(tg.editReplyMarkupClear(a.chatId, a.msgId));
    await bestEffort(tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId));
    await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, '✅ Publicado'));
    const upChatId = uploaders[a.id];
    if (upChatId) {
      const lines = ['✅ ¡Tu risa ya está publicada!'];
      if (q.title) lines.push('✏️ ' + q.title);
      if (q.tags && q.tags.length) lines.push('🏷️ ' + q.tags.join(', '));
      lines.push('🙂 ' + (q.name || 'Anónima'));
      lines.push('🔗 Tu página de autor: ' + pageUrlOf(q.uploader, cfg.webUrl));
      lines.push('📣 Grupo Risa liberada: ' + cfg.groupUrl);
      await bestEffort(tg.sendMessage(upChatId, lines.join('\n')));
      delete uploaders[a.id];
    }
    return { risas, dirty: true };
  }
  if (a.kind === 'edit-reject') {
    const q = queue[a.id];
    if (a.callbackId) await bestEffort(tg.answerCallback(a.callbackId, 'Dejamos tu risa como estaba'));
    if (q) {
      q.editing = false; q.proposed = undefined; q.pendingAccept = false;
      await bestEffort(tg.editReplyMarkupClear(a.chatId, a.msgId));
      await bestEffort(tg.editCaption(cfg.modGroupId, q.modMsgId, modCaption(q)));
      await bestEffort(tg.editReplyMarkup(cfg.modGroupId, q.modMsgId, BUTTONS(a.id)));
      await bestEffort(tg.sendMessage(cfg.modGroupId,
        'El autor no aceptó la propuesta para ' + a.id + ' — se conserva lo original.'));
    }
    return { risas, dirty: !!q };
  }
  // ---- Comandos de solo lectura y reproducción (no cambian estado) ----
  if (a.kind === 'cmd-me') {
    const key = hashId(a.chatId, TG_ID_SECRET);
    const st = authorStats(risas, queue, key);
    await bestEffort(tg.sendMessage(a.chatId,
      '👤 Tu página de autor: ' + pageUrlOf(key, cfg.webUrl) + '\n' +
      '🙂 ' + (names[key] || 'Anónima') + '\n' +
      '📀 Publicadas: ' + st.published + '\n' +
      '⏳ En moderación: ' + st.pending));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-profile') {
    const key = hashId(a.chatId, TG_ID_SECRET);
    if (a.arg) {
      const match = (Array.isArray(risas) ? risas : [])
        .filter((e) => String(e.name || '').toLowerCase() === a.arg.toLowerCase());
      if (!match.length) {
        await bestEffort(tg.sendMessage(a.chatId,
          'No encontré ningún autor con ese nombre. Prueba /profile sin palabra para ver tu página.'));
        return { risas, dirty: false };
      }
      const keys = [...new Set(match.map((e) => e.key).filter(Boolean))];
      await bestEffort(tg.sendMessage(a.chatId,
        '👥 Autor «' + a.arg + '» — páginas:\n' +
        keys.map((k) => '• ' + pageUrlOf(k, cfg.webUrl)).join('\n')));
    } else {
      await bestEffort(tg.sendMessage(a.chatId,
        '👤 Tu página de autor: ' + pageUrlOf(key, cfg.webUrl) + '\n' +
        '🙂 ' + (names[key] || 'Anónima') + '\n' +
        '📀 Publicadas: ' + authorStats(risas, queue, key).published));
    }
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-stats') {
    const today = clipsToday(risas);
    const authors = new Set((Array.isArray(risas) ? risas : []).map((e) => e.key).filter(Boolean)).size;
    await bestEffort(tg.sendMessage(a.chatId,
      '📊 Risa liberada — stats\n\n' +
      '📀 ' + (Array.isArray(risas) ? risas.length : 0) + ' risas publicadas\n' +
      '📅 ' + today.length + ' hoy\n' +
      '⏳ ' + Object.keys(queue).length + ' en moderación\n' +
      '👥 ' + authors + ' autores'));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-status') {
    const key = hashId(a.chatId, TG_ID_SECRET);
    const draft = drafts[String(a.chatId)];
    await bestEffort(tg.sendMessage(a.chatId,
      '🟢 Estado del circuito\n\n' +
      '⏳ ' + Object.keys(queue).length + ' risas en moderación\n' +
      '📅 ' + clipsToday(risas).length + ' publicadas hoy\n' +
      '📀 ' + (Array.isArray(risas) ? risas.length : 0) + ' risas publicadas\n' +
      '✏️ Tu borrador: ' + (draft ? 'en curso (termina en el mensaje anterior)' : '—') + '\n' +
      '👤 Página: ' + pageUrlOf(key, cfg.webUrl)));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-queue') {
    const entries = Object.values(queue).slice(0, 10);
    if (!entries.length) {
      await bestEffort(tg.sendMessage(a.chatId, 'No hay risas en moderación ahora mismo 💛'));
      return { risas, dirty: false };
    }
    const lines = ['⏳ En moderación (' + entries.length + '):'];
    entries.forEach((e) => lines.push('• ' + (e.title || '—') + ' · 🙂 ' + (e.name || 'Anónima')));
    await bestEffort(tg.sendMessage(a.chatId, lines.join('\n')));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-latest') {
    const clips = latestClips(risas, 5);
    if (!clips.length) {
      await bestEffort(tg.sendMessage(a.chatId, 'Aún no hay risas publicadas — sé la primera 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendMessage(a.chatId, '🆕 Últimas risas:\n\n' + clips.map(clipLine).join('\n')));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-now') {
    const e = (Array.isArray(risas) ? risas : [])[0];
    if (!e) {
      await bestEffort(tg.sendMessage(a.chatId, 'Aún no hay risas publicadas 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendMessage(a.chatId, '▶️ Ahora mismo suena:\n\n' + clipLine(e) + '\n' + e.src));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-today') {
    const clips = clipsToday(risas);
    if (!clips.length) {
      await bestEffort(tg.sendMessage(a.chatId, 'Hoy aún no se ha publicado nada 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendMessage(a.chatId,
      '📅 Hoy (' + clips.length + '):\n\n' + clips.slice(0, 10).map(clipLine).join('\n')));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-since') {
    const days = Math.min(90, Math.max(1, parseInt(a.arg, 10) || 1));
    const clips = clipsSince(risas, days);
    if (!clips.length) {
      await bestEffort(tg.sendMessage(a.chatId, 'No hay risas de los últimos ' + days + ' día(s) 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendMessage(a.chatId,
      '🗓️ Últimos ' + days + ' día(s) (' + clips.length + '):\n\n' +
      clips.slice(0, 10).map(clipLine).join('\n')));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-random') {
    const e = randomClip(risas);
    if (!e) {
      await bestEffort(tg.sendMessage(a.chatId, 'Aún no hay risas publicadas 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendMessage(a.chatId, '🎲 Del saco:\n\n' + clipLine(e) + '\n' + e.src));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-trending') {
    const top = tagTrend(risas, 50).slice(0, 5);
    if (!top.length) {
      await bestEffort(tg.sendMessage(a.chatId, 'Aún no hay etiquetas que mostrar 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendMessage(a.chatId,
      '🔥 Etiquetas con más risas:\n\n' +
      top.map((t, i) => (i + 1) + '. #' + t.tag + ' ×' + t.count).join('\n')));
    return { risas, dirty: false };
  }
  if (a.kind === 'cmd-play') {
    const e = (Array.isArray(risas) ? risas : [])[0];
    if (!e) {
      await bestEffort(tg.sendMessage(a.chatId, 'Aún no hay risas publicadas — sé la primera 💛'));
      return { risas, dirty: false };
    }
    await bestEffort(tg.sendAudioByUrl(a.chatId, e.src, clipLine(e),
      { title: e.t, performer: e.name }));
    return { risas, dirty: false };
  }
  // ---- Inline mode: search and share clips in any chat ----
  if (a.kind === 'inline-search') {
    const clips = searchClips(risas, a.query, 10);
    const results = clips.map(inlineResult);
    await bestEffort(tg.answerInlineQuery(a.queryId, results, {
      cache_time: 300,  // 5 min cache
      is_personal: false,
      switch_pm_text: results.length ? '' : '💬 Sube tu risa',
      switch_pm_parameter: 'inline_empty'
    }));
    return { risas, dirty: false };
  }
  return { risas, dirty: false };
}

// Persist risa.json + state/ and push, so the web sees new clips in real time
// instead of waiting for the workflow's own commit step.
async function commitState() {
  const { stdout } = await run('git', ['status', '--porcelain']);
  if (!stdout.trim()) return;
  const who = ['-c', 'user.name=risa bot', '-c', 'user.email=bot@users.noreply.github.com'];
  await run('git', [...who, 'add', 'risa.json', 'state/']);
  await run('git', [...who, 'commit', '-m', 'risa: publish/moderate (automated)']);
  const token = process.env.GITHUB_TOKEN;
  const remote = token
    ? `https://x-access-token:${token}@github.com/floveorg/risa.git`
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
  cfg.limits = { ...LIMITS_DEFAULTS, ...(cfg.limits || {}) };
  const tg = Telegram(token);

  let offset = parseInt(await readFile(p('state/offset.txt'), 'utf8'), 10) || 0;
  let queue = await readJSON('state/queue.json', {});
  let drafts = await readJSON('state/drafts.json', {});
  let uploaders = await readJSON('state/.uploaders.json', {});
  let uploads = await readJSON('state/uploads.json', {});
  let tgpub = await readJSON('state/tgpub.json', {});
  let names = await readJSON('state/names.json', {});
  let risas = await readJSON('risa.json', []);

  const startedAt = Date.now();
  while (Date.now() - startedAt < LOOP_MAX_MS) {
    const modMsgToId = Object.fromEntries(
      Object.entries(queue).map(([id, e]) => [e.modMsgId, id]));
    const awaitingTitle = Object.fromEntries(
      Object.entries(drafts).filter(([, d]) => d.awaitingTitle));
    const awaitingTags = Object.fromEntries(
      Object.entries(drafts).filter(([, d]) => d.awaitingTags));
    const awaitingModEdit = Object.fromEntries(
      Object.entries(queue).filter(([, e]) => e.editing));
    const updates = await tg.getUpdates(offset, POLL_TIMEOUT);
    const { actions, offset: nextOffset } = parseUpdates(
      updates, { modGroupId: cfg.modGroupId, modMsgToId, awaitingTitle, awaitingTags,
                 awaitingModEdit, uploaderOf: uploaders,
                 limits: cfg.limits }, offset);

    for (const a of actions) {
      try {
        const r = await handleAction(a, tg, cfg, queue, drafts, risas, uploaders, uploads, tgpub, names);
        risas = r.risas;
        if (r.dirty) {
          await writeJSON('state/queue.json', queue);
          await writeJSON('state/drafts.json', drafts);
          await writeJSON('state/.uploaders.json', uploaders);
          await writeJSON('state/uploads.json', uploads);
          await writeJSON('state/tgpub.json', tgpub);
          await writeJSON('state/names.json', names);
          await writeJSON('risa.json', risas);
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
      console.log(`processed ${actions.length} action(s); offset ${offset}; risas ${risas.length}`);
    }
  }

  await writeJSON('state/queue.json', queue);
  await writeJSON('state/drafts.json', drafts);
  await writeJSON('state/.uploaders.json', uploaders);
  await writeJSON('state/uploads.json', uploads);
  await writeJSON('state/tgpub.json', tgpub);
  await writeJSON('state/names.json', names);
  await writeJSON('risa.json', risas);
  await writeFile(p('state/offset.txt'), String(offset) + '\n');
  await bestEffort(commitState());
}

main().catch((e) => { console.error(e); process.exit(1); });
