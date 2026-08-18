# Versionado y releases — Risa Liberada

Política de versiones del repo `floveorg/risa`: **v1 = producción**, **v2 = desarrollo**.

> **Estado actual: v1.0.1 cortada** (2026-08-18, «Nick as tag»). El paquete
> descargable `risa-v1.0.1-nick-as-tag.zip` incluye versión, ciclo de release
> (`CHANGELOG.md` + `VERSIONING.md`) y el manual de uso (`MANUAL.md`). La rama
> de desarrollo `v2-d1` (Cloudflare D1 + Workers) vive aparte.

## 1. Dos versiones, un solo repo de producción

| | v1 | v2 |
|---|---|---|
| Qué es | **Producción estable** — lo que sirve `risa.liberada.net` y el circuito Telegram (subir·moderar·publicar). | **Desarrollo** — flove central: authy completo, `central/users/<key>/`, lovy, Railway/libSQL. |
| Dónde vive | Este repo (`floveorg/risa`), rama `main`. | Plan `…/risaliberada/plan-v2.md` (D20). **No se corta aquí.** |
| Estado | Congelado salvo **fixes** + adelantos v1.x (D21): Mini App, favoritos por aprobación, edición de lo propio. | En curso; risa migra a v2 cuando **lovy** pruebe estabilidad. |

## 2. Esquema de versiones

`v1.x.y` (semántico):

- **MAJOR (1)**: fijo en producción. Un `v2` es otra línea de vida (flove central),
  no un bump de MAJOR en este repo.
- **MINOR (x)**: adelantos v1.x (D21) — p. ej. v1.1.0 (Mini App + favoritos), v1.2.0 (edición de lo propio). Cada adelanto corta su propia release.
- **PATCH (y)**: cada **fix** de producción. **Cada fix corta su propia release**:
  entrada en `CHANGELOG.md` + bump en `config.json` + tag `v1.x.y`.

## 3. Contrato de retrocompatibilidad

La regla que hace seguro publicar sin romper nada:

- **`risa.json` es el contrato de datos hacia la web.** La web **nunca exige**
  campos nuevos: `clipsOf`/`flagsOf` aceptan array u objeto `{schema, clips}`
  (y `{flag, clips}`); `buildRisaTracks` rellena defaults
  (`tags → 'risa libre'`, `tg/key → ''`, título derivado). Un clip viejo sin
  `key`/`tg`/`authy` se sigue renderizando.
- **Formato del feed: `{ "schema": "risa-feed/1", "clips": […] }`** (v1.0.2).
  Migración explícita y retrocompatible: la web y el bot leen con `clipsOf`
  (array u objeto) y el bot escribe siempre el objeto con `schema`. El campo
  `schema` es informativo (la web lo ignora); `clips` es la lista newest-first.
- El bot **no quita** campos que la web usa: `name`, `src`, `tags`, `when`, `t`.
  Los campos authy (`key`, `tg`, …) son aditivos y opcionales.
- `state/` (`offset.txt`, `queue.json`) y `risa.json` viven en el repo: cualquier
  cambio de **formato** es una migración explícita (no silenciosa) y entra como fix
  con su changelog.
- Bot API de Telegram: la versión del runtime del workflow queda pined; cambios de
  API = fix + changelog.

## 4. Release logics (cómo se corta una release v1)

1. **Entrada en `CHANGELOG.md`** bajo `## [v1.x.y]` (solo si no existe) y el fix
   documentado en su sección.
2. **Bump `version` en `config.json`** (misma cadena que el tag).
3. **Commit + tag `v1.x.y`** en `floveorg/risa` (el tag y el push también reactivan
   el cron si llevara >60 días parado).
4. **Actualizar `risaliberada.md`** (estándar): `Versión` = el tag nuevo.
5. **Push** (quien corta la release): subir rama + tag a GitHub — GitHub Pages
   sirve `risa.liberada.net` y el `risa.json`; el pointer del submodule en el repo
   fuente de flove se sincroniza aparte (toca solo `updaty-web`/publish si hiciera).

### Qué NO es una release
- Un cambio de v2 en el plan **no** toca este repo ni su versionado.
- Cambios de `risa.json` (clips reales) **no** son releases: son contenido.

## 5. Verificación antes de una release

- `node --test` verde (funciones puras del bot + web + authy).
- `npx html-validate index.html` (si se tocó la web) o al menos el flujo de
  etiquetas/feed sano en el navegador.
- La web tolera un `risa.json` sin campos nuevos (contrato §3).
- **CI en el workflow de release (tag)** (questy Q003): `node --test` + `html-validate`
  corren en el tag antes de publicar — no dependen de la memoria del mantenedor.
