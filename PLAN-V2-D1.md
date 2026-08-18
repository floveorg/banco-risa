# Risa v2-d1 · Cloudflare D1 + Workers

Rama de desarrollo **`v2-d1`** (no sigue plan-v2.md). Enciende una capa
**aditiva** sobre el circuito v1: la web sigue leyendo `risa.json`, el bot
sigue corriendo en el cron de Actions y R2 sigue sirviendo los audios. Lo que
añade v2-d1 es un **SQL local gestionado (D1) + endpoints (Workers)** para lo
que un feed estático no puede: cuentas, búsqueda, actividad y edición.

> **Estado de la infra (native settings):** `worker/wrangler.toml` con binding
> D1 (`DB`), `worker/migrations/0001_initial.sql` (esquema + seed marcflove
> simple · maria avanzada), `worker/api.mjs` (API D1 + fallback al Worker de
> subdominios) y `worker/README.md` (pasos nativos: d1 create, execute, secrets,
> deploy). La web (`index.html`) mantiene su navegación y suma, en v2-d1,
> búsqueda fina vía `/api/search` y favoritos a un feed real vía `/api/fav`
> (fail-silent cuando la API no está).

Regla de oro heredada de v1: **`risa.json` es la verdad de lectura de la web;**
D1 es el nuevo canónico de escritura y `risa.json` queda como read-model que el
Workers regenera. Si D1/Workers se apaga, v1 sigue sirviendo (base de
recuperación).

---

## 1. Arquitectura

```
Telegram bot (cron Actions, v1) ──▶ R2 (audios) ──▶ risa.json (read-model)
        │                                                │
        ▼                                                ▼
  Workers API (v2-d1) ◀───────────────▶ D1 (canónico)  GitHub Pages (web)
        │                                                      │
        └──── addons: búsqueda · actividad · perfiles ────────▶ fetch risa.json
```

- **Workers** publican `/api/*` en `risa.liberada.net` (mismo dominio que la
  web → sin CORS).
- **D1** guarda lo que `risa.json` no puede: claims de identidad, favoritos
  por clave, actividad por app, búsqueda FTS, borradores de edición.
- El bot (v1) sigue escribiendo `risa.json` como hoy; un Workers opcional lo
  **replica a D1** (idempotente) para que los addons no dependan del feed.

## 2. Esquema D1 (mínimo, por tablas)

```sql
-- Identidad: la key (hash salado) es el id de autor, nunca en claro.
CREATE TABLE identities (
  key        TEXT PRIMARY KEY,      -- hash salado (v1) o id futuro
  username   TEXT UNIQUE,           -- subdominio <user>.liberada.net
  name       TEXT,                  -- nombre público
  bio        TEXT DEFAULT '',
  email      TEXT,                  -- vía de recuperación (opt-in)
  socials    TEXT DEFAULT '[]',     -- JSON [{net,url}]
  recover    TEXT DEFAULT '[]',     -- vías: bot · email
  claimed_at TEXT,
  updated_at TEXT
);

-- Actividad: una fila por pieza publicada en cualquier app de liberada.
CREATE TABLE activity (
  key     TEXT,                     -- autor (hash)
  app     TEXT,                     -- risa | ama | lovy | ...
  item_id TEXT,                     -- id en el feed de la app
  at      TEXT,
  PRIMARY KEY (app, item_id)
);
CREATE INDEX idx_act_key ON activity(key, at DESC);

-- Favoritos (multi-app) y actividad local sincronizada.
CREATE TABLE favs (
  key     TEXT,
  app     TEXT,
  item_id TEXT,
  at      TEXT,
  PRIMARY KEY (key, app, item_id)
);

-- Búsqueda full-text (addon f1SS).
CREATE VIRTUAL TABLE search_fts USING fts5(
  item_id, app, title, tags, name, content='activity'
);
```

## 3. Endpoints Workers (`/api/*`)

| Método y ruta | Qué hace | Quién |
|---|---|---|
| `GET  /api/users/<username>` | perfil agregado (identity + actividad + socials) | web / agregador |
| `POST /api/claim` | claim de identidad (código del bot, 1 solo uso) | miniapp |
| `POST /api/profile` | editar nombre, bio, socials (requiere claim válido) | miniapp / bot |
| `POST /api/recover` | añadir email / vías de recuperación | miniapp |
| `POST /api/fav` · `GET /api/favs/<key>` | favoritos en la nube (sincronizan las playlists) | web |
| `GET  /api/search?q=` | f1SS: búsqueda full-text sobre `search_fts` | web / bot |
| `GET  /api/activity/<key>` | actividad cruzada de apps (juega y filtra) | perfiles |
| `POST /api/ingest` | replica `risa.json` → D1 (idempotente, llama el cron) | bot |

## 4. Addons propuestos

- **f1SS search** — búsqueda full-text (FTS5) sobre títulos, tags y nombres;
  la web mantiene su buscador actual como fallback sin red.
- **Favoritos en la nube** — la estrella ⭐ deja de ser solo local: con claim,
  se sincroniza entre dispositivos y se comparte por URL.
- **Actividad cruzada** — «juega y filtra»: el perfil agrega risas + amas + lo
  que juegues en otras apps liberada (powered by `activity`).
- **Perfiles editables** — nombre, bio extendida y redes desde la miniapp con
  claim de identidad (código del bot / email), no solo con comandos.
- **Cadenas enriquecidas** — hilos con contexto en D1 (el `parent` de v1 queda
  intacto; D1 añade conteo y vista).
- **Webhooks reales** — Workers con webhook de Telegram en vez de solo cron:
  avisos al autor al instante, rate-limit y cola gestionada.

## 5. Tunings para el HTML y el flujo actuales

La v1 es **un solo HTML sin build + git como base de datos**. v2-d1 debe
respetar eso, no romperlo:

1. **La web sigue siendo estática y sin build.** Los addons se activan por
   fetch condicional a `/api/*` con timeout y fail-silent (mismo patrón que
   `flove.json`): si el Workers calla, la página queda idéntica.
2. **`risa.json` = read-model garantizado.** El Workers regenera `risa.json`
   desde D1 tras cada escritura (o el cron lo hace); nunca al revés.
3. **Claim sin tocar el bot.** El flujo de código que ya tiene el bot
   (`codes.json` → key) se mantiene; Workers valida el código y emite un
   token de corta vida para `/api/*`.
4. **Una tabla `activity` por app.** Cada app (risa, ama, lovy) replica su feed
   a D1 con `POST /api/ingest`; el perfil agregador las mezcla sin tocar sus
   HTML.
5. **Favoritos: primero local, luego nube.** Sin claim la estrella sigue
   funcionando local (como hoy); con claim se sincroniza. No exige nada nuevo
   en el HTML hasta que el usuario se autentique.
6. **Búsqueda con dos niveles.** `GET /api/search` cuando hay red; el filtro
   local actual cuando no la hay. La UI no cambia: un solo input.
7. **R2 sigue siendo el almacén de medios**; D1 nunca guarda blobs, solo
   metadatos e índices. Misma política de coste cero (D1 gratis hasta
   ~5 M lecturas/mes; Workers gratis 100k peticiones/día).
8. **Moderación intacta en v1.** El grupo de moderadores y el bot no cambian;
   D1 solo añade auditoría opcional (quién aprobó, cuándo).

## 6b. Hilos y navegación profunda (v2-d1)

v1 ya tiene hilos reales: `parent` en `risa.json`, orden depth-first
(`threadOrder`), conectores visuales y el flujo «reenvía el clip → responde»
en el bot (`clipByChannelMsg` + `hasAncestor` contra ciclos). v2-d1 lo lleva a
una **navegación más interactiva y profunda visualmente** sin tocar el esquema:

- **Vista árbol de ramas.** En la página de autor y en la playlist, un clip con
  respuestas despliega un árbol colapsable: ramas por autor, profundidad visual
  (indentación + conector), y botón «seguir la rama» que filtra a esa línea.
- **Modo foco.** Clic en un clip → vista centrada con el contexto del padre
  (preview), sus respuestas y las de los siguientes: navegación por flechas
  entre nodos (arriba/abajo), sin salir de la página.
- **Previews de padre.** En el feed plano, las respuestas muestran un chip
  «↳ responde a <título>» que abre un mini-preview del padre en el propio
  reproductor (sin recargar la lista).
- **Contadores y reacciones en el árbol.** D1 (`activity` + tabla nueva
  `threads`) agrega cuántas respuestas tiene cada nodo, quién las dio y desde
  qué app — el árbol pasa a ser «actividad viva», no solo estructura.
- **Búsqueda dentro de hilos (f1SS).** `search_fts` indexa cada nodo; buscar
  un título devuelve también la **posición en su hilo** (subir/bajar).
- **Story / modo lector.** Un hilo completo como tarjeta continua (nodos
  encadenados con su audio), ideal para «leer» una conversación de risas de
  principio a fin y compartirla por URL (`#/t/<id-del-hilo>`).

Todo vive **encima** de v1: el feed sigue siendo `risa.json` y el esquema
`parent` no cambia; D1 solo añade la vista y los contadores.

## 6c. Webhook real (avisos al instante)

El v1 corre solo con cron (getUpdates cada 5–10 min). v2-d1 añade un **webhook**
de Telegram en el Workers para los avisos en tiempo real, con el cron como
**respaldo** (si el webhook falla, el cron sigue vaciando la cola):

- `POST /api/tg` (Webhook handler) — verifica `X-Telegram-Bot-Api-Secret-Token`
  (mismo secreto en `setWebhook`), procesa updates con la misma
  `parseUpdates` pura y devuelve acciones al bot que corresponda.
- `setWebhook` se configura una vez (script `bot/set-webhook.mjs`):
  `https://risa.liberada.net/api/tg?secret=<token>`; `drop_pending_updates`
  solo en el primer despliegue.
- **Avisos al instante**: al aprobarse una risa, el autor recibe el mensaje en
  segundos (no en el próximo tick); el canal y el grupo de moderación se
  actualizan igual de rápido.
- **Rate-limit y cola en D1**: tabla `updates` (update_id, status, at) para
  idempotencia compartida entre webhook y cron; `update_id` único evita
  duplicados si ambos procesan a la vez.
- **Fallback**: si `/api/tg` devuelve error, el cron sigue corriendo; el
  `offset` del cron y el del webhook comparten la misma cola (nunca procesan
  el mismo update dos veces).
- El bot v1 **no cambia**: solo se añade el handler Workers + el script de
  `setWebhook`. El webhook puede encenderse app a app (risa primero).

## 6. Hoja de ruta sugerida

1. `worker/` + `wrangler.toml` con rutas `/api/*` y D1 binding (worker ya
   existe para subdominios; se extiende).
2. Migración D1: crear tablas + seed (identities con marcflove y maria).
3. `POST /api/claim` + token; conectar la miniapp `#/entrar`.
4. `POST /api/profile` → el editor del perfil pasa a escribir en D1 (nombre,
   bio, socials) en vez de solo generar comandos.
5. f1SS: `search_fts` + `GET /api/search`; conectar el input de búsqueda.
6. `POST /api/ingest` llamado por el cron del bot tras cada publicación.
7. Favoritos en la nube y actividad cruzada en los perfiles agregadores.
