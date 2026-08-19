# Worker v2-d1 · subdominios + API D1

Un solo Worker (`api.mjs`) enruta:

- **`/api/*`** → endpoints D1 (identidad, actividad, favoritos, búsqueda f1SS,
  claim, perfil, ingest, webhook de Telegram).
- **todo lo demás** → el Worker de subdominios de siempre (`worker.mjs`):
  `<username>.liberada.net` → `liberada.net/usa/<username>/`, apps conocidas,
  subdominios de infraestructura.

## Configuración nativa (una vez)

```bash
# 1. Crear la base D1 y apuntar el binding (reemplaza <d1-id-risa-d1> en
#    wrangler.toml por el id que devuelva el create).
npx wrangler d1 create risa-d1

# 2. Aplicar el esquema + seed (marcflove simple · maria avanzada).
npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0001_initial.sql

# 3. Secretos (nunca en el repo).
npx wrangler secret put TG_WEBHOOK_SECRET     # secreto del webhook de Telegram
npx wrangler secret put CLAIM_SECRET          # firma de tokens de claim (dev)

# 4. Desplegar.
npx wrangler deploy
```

## Subdominios automáticos (nuevos usuarios)

El bucle es automático, sin crear archivos por persona:

1. **Acción disparada**: el autor dice «Sí» a la oferta de subdominio (opt-in
   del bot) o usa `/entrar` → `claimUsername()` escribe `usernames.json`.
2. **Persistencia**: el bot hace commit + push de `usernames.json` (mismo paso
   que publica `risa.json`).
3. **DNS** (una vez): o bien `*.liberada.net → floveorg.github.io` (comodín en
   el registrar; GitHub Pages sirve este mismo repo en cualquier subdominio y el
   `index.html` raíz redirige por host al perfil), o bien la zona en Cloudflare
   con este Worker (ruta `*.liberada.net/*`).
4. **Perfil**: el Worker sirve la plantilla genérica de perfil para cualquier
   username registrado — la página resuelve el usuario desde el `Host`
   (`<user>.liberada.net`) y carga sus risas del feed. No necesita carpeta.

El registro de `usernames.json` es la única fuente: quien está ahí tiene su
subdominio vivo en cuanto el DNS resuelve.

## Endpoints

| Método y ruta | Qué hace | Nota |
|---|---|---|
| `GET /api/users/:username` | perfil agregado (bio, socials, actividad, favoritos, tier) | `marcflove` = simple · `maria` = avanzada |
| `GET /api/search?q=` | búsqueda full-text (f1SS) sobre títulos/tags/nombres | fallback LIKE universal |
| `GET /api/activity/:key` | actividad cruzada de un autor | |
| `GET /api/favs/:key` | favoritos en la nube (feed real) | |
| `POST /api/fav` | añadir favorito `{key, app, item_id}` | Bearer `CLAIM_SECRET` |
| `POST /api/claim` | identidad `{username, code}` → token | dev: code = 6 primeros chars de `CLAIM_SECRET` |
| `POST /api/profile` | editar `{username, name?, bio?, socials?, email?}` | Bearer `CLAIM_SECRET` |
| `POST /api/ingest` | replica clips → `activity` + `search_fts` | llama el cron/bot |
| `POST /api/tg` | webhook de Telegram (avisos al instante) | `?secret=` + idempotencia en `updates` |

## Migraciones

`migrations/0001_initial.sql` crea: `identities` · `activity` · `favs` ·
`threads` · `updates` · `pending_updates` · `search_fts` (FTS5), y siembra
`marcflove` y `maria`.

`migrations/0002_advanced.sql` sube **marcflove a `advanced`** (bio extendida,
email, 3 redes, recuperación bot+email, favoritos y hilo) — las features
avanzadas de maria quedan disponibles para **todos** los usuarios (nuevos y
existentes).

Para migraciones nuevas: `worker/migrations/0003_<nombre>.sql` y
`npx wrangler d1 execute risa-d1 --remote --file=…`.
