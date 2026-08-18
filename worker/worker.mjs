// Cloudflare Worker: *.liberada.net → profile aggregator or app redirect
//
// Reads the subdomain from the Host header. Known app subdomains (risa, ama)
// redirect to their respective sites. Unknown subdomains look up usernames.json
// and redirect to the aggregator profile at liberada.net/usa/<username>/.
//
// Deploy:
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler deploy (from this directory)
//
// v2 switch: update APP_ROUTES and USERNAMES_URL when new apps launch.

// ── Config ──────────────────────────────────────────────────────────────────
const USERNAMES_URL = 'https://risa.liberada.net/usernames.json';
const AGGREGATOR_BASE = 'https://liberada.net/usa';
const CACHE_TTL = 300; // 5 minutes

// Known app subdomains → their own sites (not username lookups)
const APP_ROUTES = {
  risa: 'https://risa.liberada.net',
  ama:  'https://ama.liberada.net',
  // v2: add new apps here, e.g.:
  // lovy: 'https://lovy.liberada.net',
  // authy: 'https://authy.liberada.net',
};

// Subdomains to skip (infrastructure, not users)
const SKIP = new Set(['www', 'api', 'mail', 'cdn', 'ns1', 'ns2', 'dns']);

// ── Cache ───────────────────────────────────────────────────────────────────
let cache = { data: null, ts: 0 };

async function getUsernames() {
  const now = Date.now();
  if (cache.data && (now - cache.ts) < CACHE_TTL * 1000) return cache.data;
  try {
    const res = await fetch(USERNAMES_URL, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return cache.data || {};
    const data = await res.json();
    cache = { data, ts: now };
    return data;
  } catch {
    return cache.data || {};
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const host = request.headers.get('Host') || '';

    // Extract subdomain: something.liberada.net → "something"
    const match = host.match(/^([a-z0-9_-]+)\.liberada\.net$/i);
    if (!match) {
      return Response.redirect('https://liberada.net', 302);
    }

    const sub = match[1].toLowerCase();

    // Known app subdomains → redirect to app site
    if (APP_ROUTES[sub]) {
      return Response.redirect(APP_ROUTES[sub], 302);
    }

    // Infrastructure subdomains → skip
    if (SKIP.has(sub)) {
      return Response.redirect('https://liberada.net', 302);
    }

    // Unknown subdomain → look up username → serve the profile AT the subdomain
    // (canonical). El perfil aplanado vive en liberada.net/usa/<user>.html y se
    // sirve aquí sin redirección (evita el bucle con el guard de esa página).
    const usernames = await getUsernames();
    const entry = usernames[sub];

    if (entry && entry.key) {
      const page = AGGREGATOR_BASE + '/' + encodeURIComponent(sub) + '.html';
      try {
        const res = await fetch(page);
        if (res.ok) {
          return new Response(await res.text(), {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
          });
        }
      } catch (_) {}
      return Response.redirect(page, 302);
    }

    // Username not found → main site
    return Response.redirect('https://liberada.net', 302);
  }
};
