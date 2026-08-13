// One-off migration: move the R2 objects stored under the `banco-risa/` prefix
// to the `risa/` prefix (clips + seed audio), then rewrite every URL that points
// at the old prefix (risa.json srcs, the seed `A` const in index.html,
// config.json r2Folder). Run from .github/workflows/migrate-r2.yml (manual).
// Needs the same R2_* env vars as the bot (GitHub secrets).
import { readFile, writeFile, readdir } from 'node:fs/promises';
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

export function rewriteSeedConst(html) {
  return html.split('.r2.dev/banco-risa/seed/audio/').join('.r2.dev/risa/seed/audio/');
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

  const seedFiles = (await readdir(p('seed/audio'))).filter((f) => f.endsWith('.mp3')).sort();
  for (const f of seedFiles) {
    const url = await uploadAudio(p('seed/audio/' + f), { publicId: f.replace(/\.mp3$/, ''), folder: 'risa/seed/audio' });
    console.log('seed ' + f + ' -> ' + url);
    moved++;
  }

  await writeFile(p('risa.json'), rewriteUrls(await readFile(p('risa.json'), 'utf8'), publicBase));
  await writeFile(p('index.html'), rewriteSeedConst(await readFile(p('index.html'), 'utf8')));
  await writeFile(p('config.json'), rewriteConfig(await readFile(p('config.json'), 'utf8')));

  console.log(moved ? 'done: ' + moved + ' objects migrated to risa/' : 'nothing to migrate (already risa/)');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error('migrate-r2 failed: ' + e.message); process.exit(1); });
}
