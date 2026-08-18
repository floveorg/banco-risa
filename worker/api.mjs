// v2-d1 · API Worker sobre D1 — identidad, actividad, favoritos, búsqueda (f1SS)
// y webhook de Telegram. Enruta `/api/*` a D1 y delega el resto al Worker de
// subdominios (worker.mjs), que sigue igual.
//
// Despliegue (ver worker/README.md):
//   npx wrangler d1 create risa-d1
//   npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0001_initial.sql
//   npx wrangler secret put CLAIM_SECRET
//   npx wrangler deploy

import subdomainWorker from './worker.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const err = (msg, status = 400) => json({ ok: false, error: msg }, status);

// Dev-auth: en modo desarrollo (sin CLAIM_SECRET) el bearer 'devris' vale,
// para que el demo de marcflove funcione sin configurar secretos. En
// producción exige el CLAIM_SECRET real.
const authed = (env, request) =>
  request.headers.get('authorization') === 'Bearer ' + (env.CLAIM_SECRET || '')
  || (!env.CLAIM_SECRET && request.headers.get('authorization') === 'Bearer devris');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── API ──────────────────────────────────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      const db = env.DB;
      const [base, ...rest] = url.pathname.slice(5).split('/');
      const method = request.method;

      // GET /api/users/:username — perfil agregado (marcflove simple · maria avanzada)
      if (base === 'users' && rest[0] && method === 'GET') {
        const user = await db.prepare(
          'SELECT * FROM identities WHERE username = ?').bind(rest[0]).first();
        if (!user) return err('usuario no encontrado', 404);
        const act = await db.prepare(
          'SELECT app, item_id, title, tags, kind, at FROM activity WHERE key = ? ORDER BY at DESC')
          .bind(user.key).all();
        const favs = await db.prepare(
          'SELECT app, item_id, at FROM favs WHERE key = ? ORDER BY at DESC').bind(user.key).all();
        return json({
          ok: true, key: user.key, username: user.username, name: user.name,
          bio: user.bio, email: user.email, socials: JSON.parse(user.socials || '[]'),
          recover: JSON.parse(user.recover || '[]'), tier: user.tier, claimed_at: user.claimed_at,
          activity: act.results, favorites: favs.results
        });
      }

      // GET /api/search?q= — búsqueda full-text (f1SS) sobre search_fts
      if (base === 'search' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        if (q.length < 2) return json({ ok: true, results: [] });
        const like = '%' + q.toLowerCase() + '%';
        // FTS5 + fallback LIKE (FTS5 necesita tokenización; LIKE es universal).
        const rows = await db.prepare(
          `SELECT s.item_id, s.app, s.title, s.tags, s.name, a.key
           FROM search_fts s LEFT JOIN activity a ON a.app = s.app AND a.item_id = s.item_id
           WHERE lower(s.title) LIKE ? OR lower(s.tags) LIKE ? OR lower(s.name) LIKE ?
           ORDER BY s.name LIMIT 20`).bind(like, like, like).all();
        return json({ ok: true, q, results: rows.results });
      }

      // GET /api/activity/:key — actividad cruzada de un autor
      if (base === 'activity' && rest[0] && method === 'GET') {
        const rows = await db.prepare(
          'SELECT app, item_id, title, tags, kind, at FROM activity WHERE key = ? ORDER BY at DESC')
          .bind(rest[0]).all();
        return json({ ok: true, key: rest[0], activity: rows.results });
      }

      // GET /api/favs/:key — favoritos en la nube (feed real)
      if (base === 'favs' && rest[0] && method === 'GET') {
        const rows = await db.prepare(
          'SELECT app, item_id, at FROM favs WHERE key = ? ORDER BY at DESC').bind(rest[0]).all();
        return json({ ok: true, key: rest[0], favorites: rows.results });
      }

      // POST /api/fav — añadir favorito { key, app, item_id } (dev: Bearer claim-secret)
      if (base === 'fav' && method === 'POST') {
        if (!authed(env, request)) return err('no autorizado', 401);
        const b = await request.json().catch(() => ({}));
        if (!b.key || !b.app || !b.item_id) return err('faltan key/app/item_id');
        await db.prepare('INSERT OR REPLACE INTO favs (key, app, item_id, at) VALUES (?,?,?,?)')
          .bind(b.key, b.app, b.item_id, new Date().toISOString().slice(0, 10)).run();
        return json({ ok: true });
      }

      // GET /api/aliases/:key — aliases públicos (+ privados solo si auth).
      if (base === 'aliases' && rest[0] && method === 'GET') {
        const rows = await db.prepare('SELECT alias, private FROM aliases WHERE key = ? ORDER BY created_at')
          .bind(rest[0]).all();
        const ok = authed(env, request);
        const aliases = rows.results
          .filter((a) => !a.private || ok)
          .map((a) => ({ alias: a.alias, private: !!a.private }));
        return json({ ok: true, key: rest[0], aliases });
      }

      // POST /api/aliases — crear alias { key, alias, private? }
      if (base === 'aliases' && method === 'POST') {
        if (!authed(env, request)) return err('no autorizado', 401);
        const b = await request.json().catch(() => ({}));
        if (!b.key || !b.alias) return err('faltan key/alias');
        await db.prepare('INSERT OR IGNORE INTO aliases (key, alias, private, created_at) VALUES (?,?,?,?)')
          .bind(b.key, String(b.alias).slice(0, 40), b.private ? 1 : 0,
                new Date().toISOString().slice(0, 10)).run();
        return json({ ok: true });
      }

      // POST /api/claim — identidad: { username, code } → token (dev simplificado:
      // valida el código contra una tabla `codes` o el secret si se comparte).
      if (base === 'claim' && method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const code = String(b.code || '');
        if (!code || code.length !== 6) return err('código de 6 dígitos requerido');
        const user = await db.prepare('SELECT * FROM identities WHERE username = ?')
          .bind(b.username || '').first();
        if (!user) return err('usuario no encontrado', 404);
        // Dev: acepta el código si coincide con el CLAIM_SECRET (corto) o
        // consulta la tabla `codes` cuando el bot la replique a D1.
        const ok = code === String(env.CLAIM_SECRET || '').slice(0, 6);
        if (!ok) return err('código inválido');
        return json({ ok: true, token: 'dev-' + user.key, user: user.username, tier: user.tier });
      }

      // POST /api/profile — editar { username, name?, bio?, socials?, email? }
      if (base === 'profile' && method === 'POST') {
        if (!authed(env, request)) return err('no autorizado', 401);
        const b = await request.json().catch(() => ({}));
        const user = await db.prepare('SELECT * FROM identities WHERE username = ?')
          .bind(b.username || '').first();
        if (!user) return err('usuario no encontrado', 404);
        await db.prepare(
          'UPDATE identities SET name=?, bio=?, email=?, socials=?, updated_at=? WHERE key=?')
          .bind(b.name != null ? b.name : user.name,
                b.bio != null ? b.bio : user.bio,
                b.email != null ? b.email : user.email,
                b.socials != null ? JSON.stringify(b.socials) : user.socials,
                new Date().toISOString().slice(0, 10), user.key).run();
        return json({ ok: true, username: user.username });
      }

      // POST /api/ingest — replica clips → activity + search_fts (llama el cron/bot)
      if (base === 'ingest' && method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const clips = Array.isArray(b) ? b : (b.clips || []);
        if (!clips.length) return err('sin clips');
        for (const c of clips) {
          if (!c.id || !c.app || !c.key) continue;
          await db.prepare(
            'INSERT OR REPLACE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES (?,?,?,?,?,?,?,?)')
            .bind(c.key, c.app, c.id, c.t || '', c.tags || '', c.kind || 'audio',
                  c.src || null, c.when || new Date().toISOString().slice(0, 10)).run();
          await db.prepare(
            'INSERT OR REPLACE INTO search_fts (item_id, app, title, tags, name) VALUES (?,?,?,?,?)')
            .bind(c.id, c.app, c.t || '', String(c.tags || '').replace(/[;,]/g, ' '), c.name || '').run();
        }
        return json({ ok: true, ingested: clips.length });
      }

      // POST /api/tg — webhook de Telegram (avisos al instante, §6c)
      if (base === 'tg' && method === 'POST') {
        const secret = env.TG_WEBHOOK_SECRET || '';
        if (!secret || url.searchParams.get('secret') !== secret) return err('unauthorized', 401);
        const body = await request.json().catch(() => ({}));
        const updateId = body.update_id;
        if (updateId != null) {
          const existing = await db.prepare('SELECT update_id FROM updates WHERE update_id = ?')
            .bind(updateId).first();
          if (existing) return json({ ok: true, dup: true });
          await db.prepare('INSERT OR IGNORE INTO updates (update_id, status, at) VALUES (?,?,?)')
            .bind(updateId, 'received', new Date().toISOString()).run();
        }
        await db.prepare('INSERT INTO pending_updates (update_id, payload, at) VALUES (?,?,?)')
          .bind(updateId ?? 'unknown', JSON.stringify(body), new Date().toISOString()).run();
        return json({ ok: true, queued: true });
      }

      return err('ruta no encontrada', 404);
    }

    // ── Fuera de /api: el Worker de subdominios de siempre ───────────────
    return subdomainWorker.fetch(request);
  }
};
