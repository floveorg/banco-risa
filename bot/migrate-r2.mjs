// One-off migration: move the R2 clips stored under the `banco-risa/` prefix to
// the `risa/` prefix, then rewrite every URL that points at the old prefix
// (risa.json srcs and config.json r2Folder). The seed audio library lives only
// in R2 (never in this repo) and keeps its own path, so the app's seed const is
// untouched. Run from .github/workflows/migrate-r2.yml (manual dispatch).
// Needs the same R2_* env vars as the bot (GitHub secrets).
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function r2ClipKeys(srcs, publicBase) {
  const base = publicBase.replace(/\/+$/, '') + '/';
  return [...new Set(srcs
    .filter((s) => s.startsWith(base) && s.includes('/banco-risa/q_'))
    .map((s) => s.slice(base.length)))]
    .sort();
}

export function rewriteUrls(jsonText, publicBase) {
  const base = publicBase.replace(/\/+$/, '');
  return jsonText.split(base + '/banco-risa/').join(base + '/risa/');
}

export function rewriteConfig(configText) {
  return configText.split('"r2Folder": "banco-risa"').join('"r2Folder": "risa"');
}

const ROOT = new URL('..', import.meta.url).pathname;
const p = (rel) => ROOT + rel;

async function main() {
  const publicBase = process.env.R2_PUBLIC_BASE;
  if (!publicBase) throw new Error('R2_PUBLIC_BASE env missing');

  const { uploadAudio } = await import('./r2.mjs');

  let moved = 0;
  const banco = JSON.parse(await readFile(p('risa.json'), 'utf8'));
  const keys = r2ClipKeys(banco.map((c) => c.src || ''), publicBase);
  for (const key of keys) {
    const id = key.replace(/^banco-risa\/q_/, 'q_').replace(/\.mp3$/, '');
    const res = await fetch(publicBase.replace(/\/+$/, '') + '/' + key);
    if (!res.ok) throw new Error('fetch ' + key + ': ' + res.status);
    const tmp = '/tmp/' + id + '.mp3';
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    const url = await uploadAudio(tmp, { publicId: id, folder: 'risa' });
    console.log('clip ' + id + ' -> ' + url);
    moved++;
  }

  await writeFile(p('risa.json'), rewriteUrls(await readFile(p('risa.json'), 'utf8'), publicBase));
  await writeFile(p('config.json'), rewriteConfig(await readFile(p('config.json'), 'utf8')));

  console.log(moved ? 'done: ' + moved + ' objects migrated to risa/' : 'nothing to migrate (already risa/)');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error('migrate-r2 failed: ' + e.message); process.exit(1); });
}
