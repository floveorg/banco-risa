// Sync the seed audio files (source-of-truth in this repo) up to Cloudflare R2,
// so the web app plays them straight from the bucket instead of from GitHub.
// Idempotent: uploads every mp3 in seed/audio under <r2Folder>/seed/audio/ and
// prints the public URL. Needs the same R2_* env vars as the bot (GitHub secrets).
import { readdir, readFile } from 'node:fs/promises';
import { uploadAudio } from './r2.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const p = (rel) => ROOT + rel;

const readJSON = async (rel, fallback) => {
  try { return JSON.parse(await readFile(p(rel), 'utf8')); } catch { return fallback; }
};

async function main() {
  const cfg = await readJSON('config.json', {});
  const folder = cfg.r2Folder ? cfg.r2Folder + '/seed/audio' : 'seed/audio';
  const files = (await readdir(p('seed/audio'))).filter((f) => f.endsWith('.mp3')).sort();
  if (!files.length) { console.log('No seed audio files found'); return; }
  for (const f of files) {
    const url = await uploadAudio(p('seed/audio/' + f), { publicId: f.replace(/\.mp3$/, ''), folder });
    console.log('ok ' + f + '  ->  ' + url);
  }
  console.log('done: ' + files.length + ' seed clips synced to R2');
}

main().catch((e) => { console.error('sync-seed failed: ' + e.message); process.exit(1); });
