// bot/publish.mjs — R2 upload → feed write → channel post → git commit
import { readFile, writeFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FILE_BYTES, prependClip, risaEntry } from './logic.mjs';
import { uploadAudio, uploadMedia } from './r2.mjs';
import { buildFeeds } from '../build-rss.mjs';

const run = promisify(execFile);
const ROOT = new URL('..', import.meta.url).pathname;
const p = (rel) => ROOT + rel;

const writeJSON = (rel, v) => writeFile(p(rel), JSON.stringify(v, null, 2) + '\n');
const isoToday = () => new Date().toISOString().slice(0, 10);

// Answering the callback is cosmetic — never let it block the real work.
const bestEffort = (promise) => promise.catch((err) => console.error('non-fatal:', err.message));

// Etiquetas como hashtags (buscables en Telegram) para la descripción del audio.
function tagsHash(tags) {
  return (tags || []).map(t => '#' + t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).join(' ');
}

// Escribe risa.json (formato `{ schema, clips }` explícito y retrocompatible)
// y regenera los feeds RSS/Atom del feed en el mismo paso.
export async function persistFeed(risas, cfg) {
  await writeJSON('risa.json', { schema: 'risa-feed/1', clips: risas });
  await bestEffort(buildFeeds(risas, cfg));
}

// Download → encode (MP3 audio / MP4 vídeo comprimido) → R2 → risas → channel.
// Returns the new risas array.
export async function publishClip(tg, cfg, q, id, risas, names, tgpub) {
  const filePath = await tg.getFilePath(q.fileId);
  const srcRaw = join(tmpdir(), id + '.vsrc');
  const out = join(tmpdir(), id + (q.video ? '.mp4' : '.mp3'));
  try {
    await tg.downloadFile(filePath, srcRaw);
    let src, posted;
    if (q.video) {
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
    let caption = [q.title, tagsHash(q.tags), name].filter(Boolean).join(' · ');
    if (q.parent) {
      const parentClip = risas.find((e) => e.id === q.parent);
      if (parentClip) {
        const ch = String(cfg.channel || '').replace(/^@/, '');
        caption += '\n↳ En respuesta a «' + (parentClip.t || parentClip.name || 'esta risa') + '»' +
          ((parentClip.channelMsgId && ch) ? (' — https://t.me/' + ch + '/' + parentClip.channelMsgId) : '');
      }
    }
    if (q.video) {
      posted = await tg.sendVideoByUrl(cfg.channel, src, caption);
    } else {
      posted = await tg.sendAudioByUrl(cfg.channel, src, caption, { title: q.title, performer: name });
    }
    risas = prependClip(risas, risaEntry({
      id, name, key: who, t: q.title, tags: (q.tags || []).join(', '), when: isoToday(), src, tg: tgLink, video: !!q.video,
      parent: q.parent || null, channelMsgId: posted && posted.message_id, remix: !!q.remix
    }));
    if (posted && posted.message_id) {
      await bestEffort(tg.setMessageReaction(cfg.channel, posted.message_id, '😂'));
    }
  } finally {
    await rm(srcRaw, { force: true });
    await rm(out, { force: true });
  }
  return risas;
}

// Persist risa.json + state/ and push, so the web sees new clips in real time.
export async function commitState() {
  const { stdout } = await run('git', ['status', '--porcelain']);
  if (!stdout.trim()) return;
  const who = ['-c', 'user.name=risa bot', '-c', 'user.email=bot@users.noreply.github.com'];
  await run('git', [...who, 'add', 'risa.json', 'usernames.json', 'risa.xml', 'atom.xml', 'state/']);
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
