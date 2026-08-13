// Sync the risa web app's media (photos + categorias gallery) up to Cloudflare R2
// under <PUBLIC_BASE>/risa/…, so the app loads them from the bucket with absolute
// URLs instead of from GitHub. Idempotent: walks media/ and categorias/ at the
// repo root, uploads every file keeping the risa/ prefix in the R2 key
// (key = risa/<rel>) and prints the public URL. Needs the same R2_* env vars as
// the bot (GitHub secrets).
import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { uploadMedia } from './r2.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const p = (rel) => ROOT + rel;

const readJSON = async (rel, fallback) => {
  try { return JSON.parse(await readFile(p(rel), 'utf8')); } catch { return fallback; }
};

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg'
};

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = dir + '/' + ent.name;
    out.push(...(ent.isDirectory() ? await walk(full) : [full]));
  }
  return out;
}

async function main() {
  await readJSON('config.json', {});
  const roots = [['media', 'risa/media'], ['categorias', 'risa/categorias']];
  let n = 0;
  for (const [root, keyPrefix] of roots) {
    for (const f of (await walk(p(root))).sort()) {
      const contentType = CONTENT_TYPES[extname(f).toLowerCase()];
      if (!contentType) continue;
      const rel = f.slice(p(root).length + 1);
      const url = await uploadMedia(f, { key: keyPrefix + '/' + rel, contentType });
      console.log('ok ' + rel + '  ->  ' + url);
      n++;
    }
  }
  console.log('done: ' + n + ' media files synced to R2');
}

main().catch((e) => { console.error('sync-media failed: ' + e.message); process.exit(1); });
