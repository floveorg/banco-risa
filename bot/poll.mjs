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

const BUTTONS = (id) => ({ inline_keyboard: [[
  { text: '✅ Publicar', callback_data: 'ok:' + id },
  { text: '🗑 Borrar',   callback_data: 'no:' + id }
]] });

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
    banco = prependClip(banco, bancoEntry({ id, name: q.name, tags: q.title, when: isoToday(), src, t: q.title }));
    const posted = await tg.sendAudioByUrl(cfg.channel, src, q.name + ' · CC BY-SA 4.0');
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
async function handleAction(a, tg, cfg, queue, banco) {
  if (a.kind === 'ingest') {
    if (queue[a.id] || banco.some((e) => e.id === a.id)) return { banco, dirty: false };
    const copied = await tg.copyMessage(cfg.modGroupId, a.fromChatId, a.fromMsgId, BUTTONS(a.id));
    queue[a.id] = { fileId: a.fileId, name: a.name, title: a.title,
                    uploaderChatId: a.uploaderChatId, modMsgId: copied.message_id, ts: Date.now() };
    await tg.sendMessage(a.uploaderChatId,
      '¡Recibida! 💛 Se publica sola en un momento; los moderadores pueden frenarla si no procede.\n' +
      'Puedes ponerle un título añadiendo un pie (caption) al audio.');
    return { banco, dirty: true };
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
      const src = banco[0] && banco[0].src;
      await bestEffort(tg.sendMessage(q.uploaderChatId, [
        '✅ ¡Tu risa ya está publicada!',
        '📣 Grupo Risa liberada: ' + cfg.groupUrl,
        '🌐 Web: ' + cfg.webUrl,
        src ? '🔊 Tu risa: ' + src : ''
      ].filter(Boolean).join('\n')));
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
  let banco = await readJSON('banco.json', []);
  for (const e of Object.values(queue)) if (!e.ts) e.ts = Date.now(); // legacy entries

  const startedAt = Date.now();
  while (Date.now() - startedAt < LOOP_MAX_MS) {
    const modMsgToId = Object.fromEntries(
      Object.entries(queue).map(([id, e]) => [e.modMsgId, id]));
    const updates = await tg.getUpdates(offset, POLL_TIMEOUT);
    const { actions, offset: nextOffset } = parseUpdates(
      updates, { modGroupId: cfg.modGroupId, modMsgToId }, offset);

    // Trusted mod group: clips nobody decided on within the grace period publish on their own.
    for (const id of Object.keys(queue)) {
      if (Date.now() - (queue[id].ts || 0) > AUTO_PUBLISH_MS) {
        actions.push({ kind: 'approve', id, via: 'auto' });
      }
    }

    for (const a of actions) {
      try {
        const r = await handleAction(a, tg, cfg, queue, banco);
        banco = r.banco;
        if (r.dirty) {
          await writeJSON('state/queue.json', queue);
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
  await writeJSON('banco.json', banco);
  await writeFile(p('state/offset.txt'), String(offset) + '\n');
  await bestEffort(commitState());
}

main().catch((e) => { console.error(e); process.exit(1); });
