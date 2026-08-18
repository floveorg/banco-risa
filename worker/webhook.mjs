// v2-d1 · Webhook handler de Telegram (avisos al instante).
//
// Recibe POSTs de Telegram en /api/tg?secret=<token>, valida el secreto y
// procesa el update. En v1 el cron sigue siendo el motor; este handler es la
// capa aditiva que da avisos en tiempo real (ver PLAN-V2-D1.md §6c).
//
// Despliegue (v2-d1):
//   1. wrangler d1 create risa-db   → bind en wrangler.toml
//   2. bot/set-webhook.mjs configura setWebhook(url, secret)
//   3. wrangler deploy
//
// Los secrets viven como variables de entorno del Worker (secrets, no texto).

const SECRET = env => env.TG_WEBHOOK_SECRET || '';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /api/tg → health check simple.
    if (request.method === 'GET' && url.pathname === '/api/tg') {
      return new Response(JSON.stringify({ ok: true, webhook: 'v2-d1' }), {
        headers: { 'content-type': 'application/json' } });
    }

    if (request.method !== 'POST' || url.pathname !== '/api/tg') {
      return new Response('not found', { status: 404 });
    }

    // Autenticación: secreto compartido con setWebhook.
    const secret = SECRET(env);
    if (!secret || url.searchParams.get('secret') !== secret) {
      return new Response('unauthorized', { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Idempotencia: el update solo se procesa una vez (tabla `updates`).
    const updateId = body.update_id;
    if (updateId != null) {
      const existing = await env.DB.prepare('SELECT update_id FROM updates WHERE update_id = ?')
        .bind(updateId).first();
      if (existing) return new Response('dup', { status: 200 });
      await env.DB.prepare('INSERT OR IGNORE INTO updates (update_id, status, at) VALUES (?, ?, ?)')
        .bind(updateId, 'received', new Date().toISOString()).run();
    }

    // Procesar con la lógica pura de v1 (parseUpdates). El resultado se
    // encola para que el cron (o este mismo handler) lo aplique.
    const pending = await env.DB.prepare(
      'INSERT INTO pending_updates (update_id, payload, at) VALUES (?, ?, ?)')
      .bind(updateId ?? 'unknown', JSON.stringify(body), new Date().toISOString())
      .run().catch(() => null);

    return new Response(JSON.stringify({ ok: true, queued: !!pending }), {
      headers: { 'content-type': 'application/json' } });
  }
};
