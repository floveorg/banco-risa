import { readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUpdates, bancoEntry, prependClip } from './logic.mjs';
import { Telegram } from './telegram.mjs';
import { uploadAudio } from './cloudinary.mjs';

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

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) throw new Error('CLOUDINARY_URL missing');
  const cfg = await readJSON('config.json', {});
  if (!cfg.modGroupId) throw new Error('config.json modGroupId not set (run Task 6)');
  const tg = Telegram(token);

  const offset = parseInt(await readFile(p('state/offset.txt'), 'utf8'), 10) || 0;
  const queue = await readJSON('state/queue.json', {});
  let banco = await readJSON('banco.json', []);

  const updates = await tg.getUpdates(offset);
  const { actions, offset: nextOffset } = parseUpdates(updates, { modGroupId: cfg.modGroupId }, offset);

  for (const a of actions) {
    try {
      if (a.kind === 'ingest') {
        // copy the audio into the mod group with the approve/reject buttons
        const copied = await tg.copyMessage(cfg.modGroupId, a.fromChatId, a.fromMsgId, BUTTONS(a.id));
        queue[a.id] = { fileId: a.fileId, name: a.name, tags: a.tags,
                        uploaderChatId: a.uploaderChatId, modMsgId: copied.message_id };
        await tg.sendMessage(a.uploaderChatId,
          '¡Recibida! 💛 Un par de moderadores la revisan; si entra, sonará en el banco. ' +
          'Al enviarla la publicas en libre, bajo CC BY-SA 4.0.');
      } else if (a.kind === 'approve') {
        const q = queue[a.id];
        await tg.answerCallback(a.callbackId, q ? 'Publicando…' : 'Ya resuelta');
        if (!q) continue;
        if (!q.fileId) throw new Error('queue entry missing fileId for ' + a.id);
        const filePath = await tg.getFilePath(q.fileId);
        const oga = join(tmpdir(), a.id + '.oga');
        const mp3 = join(tmpdir(), a.id + '.mp3');
        try {
          await tg.downloadFile(filePath, oga);
          await run('ffmpeg', ['-y', '-i', oga, '-af', 'loudnorm', '-codec:a', 'libmp3lame', '-q:a', '4', mp3]);
          // audio → Cloudinary (video resource type); banco.json keeps only the URL
          const src = await uploadAudio(cloudinaryUrl, mp3, { publicId: a.id, folder: cfg.cloudinaryFolder });
          banco = prependClip(banco, bancoEntry({ id: a.id, name: q.name, tags: q.tags, when: isoToday(), src }));
          await tg.sendAudioByUrl(cfg.channel, src, q.name + ' · CC BY-SA 4.0');
        } finally {
          await rm(oga, { force: true });
          await rm(mp3, { force: true });
        }
        await tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId);
        await tg.editCaption(cfg.modGroupId, q.modMsgId, '✅ Publicado');
        delete queue[a.id];
      } else if (a.kind === 'reject') {
        const q = queue[a.id];
        await tg.answerCallback(a.callbackId, 'Borrada');
        if (q) {
          await tg.editReplyMarkupClear(cfg.modGroupId, q.modMsgId);
          await tg.editCaption(cfg.modGroupId, q.modMsgId, '🗑 Borrada');
          delete queue[a.id];
        }
      }
    } catch (err) {
      console.error('action failed', a.id, a.kind, err.message); // leave in queue; do not retry this tick
    }
  }

  await writeJSON('state/queue.json', queue);
  await writeJSON('banco.json', banco);
  await writeFile(p('state/offset.txt'), String(nextOffset) + '\n');
  console.log(`processed ${actions.length} action(s); offset ${offset} -> ${nextOffset}; banco ${banco.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
