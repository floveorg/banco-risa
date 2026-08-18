// RSS 2.0 + Atom 1.0 del feed risa.json → risa.xml / atom.xml.
// Se genera desde el repo raíz (node build-rss.mjs) y el bot lo regenera tras
// cada publicación (mismo paso que escribe risa.json).

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('.', import.meta.url);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function clipsOf(data) {
  return Array.isArray(data) ? data : (data && Array.isArray(data.clips)) ? data.clips : [];
}

// ISO (2026-08-18) → RFC 822 (Tue, 18 Aug 2026 00:00:00 +0000)
function rfc822(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return new Date().toUTCString();
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toUTCString();
}

export async function buildFeeds(risa, cfg = {}) {
  const web = String(cfg.webUrl || 'https://risa.liberada.net').replace(/\/+$/, '');
  const clips = clipsOf(risa);
  const siteTitle = 'Risa liberada · Respira, escucha, disfruta';
  const siteDesc = 'Playlists de risas, cultura y comunidad.';
  const updated = clips.length ? rfc822(clips[0].when) : new Date().toUTCString();

  const items = clips.map((c, i) => {
    const title = c.t || ('Risa de ' + (c.name || 'alguien'));
    const link = c.src || web;
    const guid = c.id || ('risa-' + i);
    const when = rfc822(c.when);
    const desc = [(c.tags || ''), (c.name || 'Anónima')].filter(Boolean).join(' · ');
    return {
      title, link, guid, when, desc,
      rss: `<item><title>${esc(title)}</title><link>${esc(link)}</link>` +
        `<guid isPermaLink="false">${esc(guid)}</guid><pubDate>${when}</pubDate>` +
        `<description>${esc(desc)}</description></item>`,
      atom: `<entry><title>${esc(title)}</title><link href="${esc(link)}"/>` +
        `<id>${esc(web + '/' + guid)}</id><updated>${when}</updated>` +
        `<summary>${esc(desc)}</summary></entry>`
    };
  });

  const rss = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>' +
    `<title>${esc(siteTitle)}</title><link>${esc(web)}</link>` +
    `<description>${esc(siteDesc)}</description><lastBuildDate>${updated}</lastBuildDate>` +
    items.map((i) => i.rss).join('') +
    '</channel></rss>\n';

  const atom = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>${esc(siteTitle)}</title>` +
    `<link href="${esc(web)}"/><id>${esc(web + '/')}</id><updated>${updated}</updated>` +
    items.map((i) => i.atom).join('') +
    '</feed>\n';

  await writeFile(new URL('risa.xml', ROOT), rss);
  await writeFile(new URL('atom.xml', ROOT), atom);
  return { items: clips.length };
}

if (process.argv[1] && process.argv[1].endsWith('build-rss.mjs')) {
  const data = JSON.parse(await readFile(new URL('risa.json', ROOT), 'utf8'));
  const { items } = await buildFeeds(data);
  console.log('✓ risa.xml + atom.xml · ' + items + ' items');
}
