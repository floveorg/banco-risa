# Changelog

Registro de cambios de **Risa Liberada** (repo `floveorg/risa`).
Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) ·
versionado `v1.x.y` · política de versiones y retrocompatibilidad en
[VERSIONING.md](VERSIONING.md).

> **v1 todavía no se ha publicado.** Está en polish: la release se corta cuando
> el circuito web + Telegram quede afinado. Este registro acumula los cambios
> bajo `[Unreleased]` hasta entonces.

## [Unreleased] — v1 en polish · v2/v3 en desarrollo

### v1 · producción (en polish, release sin cortar)

#### Añadido

- **Identidad authy v1** (`authy.js`): núcleo canal-agnóstico — niveles L1–L5,
  `keyOf` inmutable salada (sha256 `secret:canal:id`), driver Telegram real,
  email/phone stubs; contrato compartido bot ↔ web (tests).
- **Subida identificada**: palabra + hash salado (`idHash`) u id directo
  (`idDirect`), o anónima. El id en claro jamás viaja en el repo
  (`state/.uploaders.json` gitignored; `queue.json` solo lleva hash/id).
- **Clips con `key` (presencia L2)** → el nombre enlaza a `#/u/<key>` y una
  **mini-página de autor** agrega todas sus risas.
- **Opt-in C19**: enlace a `t.me` solo si el autor lo elige (`tg`), nunca
  automático. `/name` en DM para la palabra reclamada.
- **J47**: `risa.json` tolera array (v1) u objeto `{flag, clips}` (`clipsOf` /
  `flagsOf`); el flag `flove` toggla el addon desde la interfaz.
- **Circuito serverless completo**: subir (DM @RisaLiberadaBot) → moderar
  (grupo privado ✅ Publicar / 🗑 Borrar) → publicar (ffmpeg → Cloudflare R2 →
  `risa.json` newest-first → canal público) · cron GitHub Actions.
- **Anti-abuso**: máx 60 s · 10 MB · 5 en cola y 5/día por remitente (hash);
  tope de feed en la web.

#### Corregido

- **Etiquetas sin fluir (chips flotantes muertos)**: el refactor de identidad
  authy reintrodujo la declaración duplicada de `floveOn`/`floveAllowed` en
  `index.html`; el `SyntaxError` tumbaba el bloque de script entero (playlist,
  chips, fetch y mini-página nunca se inicializaban). Se elimina la duplicación
  y las etiquetas vuelven a fluir.
- **Espacio de etiquetas nunca vacío en silencio**: si `risa.json` no llega
  (sin servidor, `file://`, offline), `buildTagChips()` se ejecuta igual y se
  muestra un aviso claro en vez de un espacio en blanco (el fallo ya no parece
  un script muerto).
- **Tests sincronizados al esquema authy** (`key` en `buildRisaTracks`) + test
  dedicado de la key L2.

#### Seguridad

- La identidad de Telegram **nunca** se renderiza en la web: solo la palabra/`key`.
  El claim (L2→L3) es v2 y se resuelve por DM con verificación de id.

### v2 · desarrollo

- flove central: authy completo (claim L2→L3, filespace `central/users/<key>/`,
  perfiles de autor), lovy, y Railway + libSQL. Plan:
  `development/standards/risaliberada/plan-v2.md`
  (D20: risa NO migra a v2 hasta que lovy pruebe estabilidad).
- **No** se corta en este repo: aquí solo entran fixes de producción.

### v3 · desarrollo

- Pendiente (ver estándar `development/standards/risaliberada/risaliberada.md`,
  sección «Réplica del sistema»: versiones *Agentes*, *Introducción* y
  *Desarrollo*).
