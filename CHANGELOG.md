# Changelog

Registro de cambios de **Risa Liberada** (repo `floveorg/risa`).
Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) ·
versionado `v1.x.y` · política de versiones y retrocompatibilidad en
[VERSIONING.md](VERSIONING.md).

> **v1.0.0 cortada.** «Nick as tag»: tu nickname se convierte en tu etiqueta
> (tag-url `#/u/<key>`) y, con permiso, en tu subdominio `<username>.liberada.net`.
> El paquete descargable incluye versión, ciclo de release y el manual de uso.

## [v1.0.1] — 2026-08-18 · pulido de la release

- **Paquete descargable** ahora incluye las imágenes locales que la web
  referencia por ruta relativa (diagramas, QR y fotos de réplica) y el
  `.htmlvalidate.json` — la web se ve completa offline.
- **html-validate limpio**: `.htmlvalidate.json` (regla `prefer-native-element`
  off, igual que solo) + `aria-label` en los enlaces del modal Mejorar
  (`unique-landmark`).
- **Copy actualizada**: subdominio «opt-in (Sí quiero)» en lugar de
  «automático · sin_claim»; comandos de perfil (`/entrar`, `/mejorar`,
  `/usuario`, `/pub`) en la lista de features; suite de tests «91 verdes».
- **README** referencia el manual y el paquete descargable.

## [v1.0.0] — 2026-08-18 · «Nick as tag»

### v1 · producción (release v1.0.0)

#### Añadido

- **Circuito serverless completo**: subir (DM @RisaLiberadaBot) → moderar
  (grupo privado ✅ Publicar / 🗑 Borrar / ✏️ Editar) → publicar (ffmpeg →
  Cloudflare R2 → `risa.json` newest-first → canal público) · cron GitHub Actions.
- **Subida identificada**: palabra + hash salado (`idHash`) u id directo
  (`idDirect`), o anónima. El id en claro jamás viaja en el repo
  (`state/.uploaders.json` gitignored; `queue.json` solo lleva hash/id).
- **Clips con `key` (presencia L2)** → el nombre enlaza a `#/u/<key>` y una
  **mini-página de autor** agrega todas sus risas.
- **Opt-in C19**: enlace a `t.me` solo si el autor lo elige (`tg_public`), nunca
  automático. `/name` en DM para la palabra reclamada.
- **Inline mode** (`@RisaLiberadaBot <query>`): búsqueda de clips por título,
  tags y nombre de autor; compartir en cualquier chat como audio. Requiere
  webhook para funcionar de forma fiable (v2).
- **Vídeo**: soporte para notas de vídeo ≤ 1 min (mismos límites que audio).
- **Páginas de autor**: `#/u/<key>` agrega todos los clips de un autor.
- **Anti-abuso**: máx 60 s · 10 MB · 5 en cola y 5/día por remitente (hash);
  tope de feed en la web.
- **`/pub`** en DM: re-preguntar visibilidad del enlace a Telegram.
- **`/name`** en DM: establecer o cambiar la palabra de display.
- **Moderação mejorada**: botón ✏️ Editar para cambiar título/tags antes de
  publicar.
- **Subdominio de autor opt-in**: tras la primera publicación el bot ofrece
  `<usuario>.liberada.net` con «Sí, quiero / No sé / No, seguro»; el alta solo
  ocurre con «Sí, quiero» (ya no se auto-crea). «No sé» vuelve a preguntar en
  la siguiente publicación; «No, seguro» lo calla para siempre. En el aviso de
  publicación: «Puedes encontrar todas tus risas juntas en este enlace: …» +
  «Activa gratis: <usuario>.liberada.net (Editar)».
- **`/usuario <nombre>`** en DM: cambiar el nombre del subdominio.
- **`/entrar`** en DM y menú web «Entrar»: acceso a la miniapp de perfil
  (`#/entrar`) con opciones de código (por el bot ahora, por email próximamente).
- **`/mejorar`** en DM y menú web «Mejorar» (modal): novedades — subdominio,
  editar perfil, más apps; «tu perfil redirigirá a tus risas allí».
- **Miniapp `#/entrar`**: código de 6 dígitos que da el bot (ligado a la key,
  caduca al final del día) para identificar quién eres y ver tu perfil con tus
  risas juntas.
- **Bienvenida del bot** empieza con «Comparte tu risa con todos aquí.»
- **Título y descripción web** renombrados a «Risa liberada · Respira, escucha,
  disfruta» / «Playlists de risas, cultura y comunidad.» (preview al compartir).
- **Subdominios seedeados**: `usernames.json` con `marcflove` y `maria`, de modo
  que `marcflove.liberada.net` / `maria.liberada.net` redirigen ya al perfil
  agregador; los nuevos usuarios se registran solos con el opt-in.
- **Presencia estable del bot**: `setMyDescription`/`setMyShortDescription`/
  `setMyCommands` y `setChatDescription` de canal y grupo de moderación — el
  enlace a la miniapp (`#/entrar`) queda fijo en las descripciones.
- **Miniapp terminada**: tras autenticar con el código, muestra el panel «Activa
  tu perfil en <tu>.liberada.net» con (Activar), la nota de redirección a tus
  últimas risas y el acceso a tus risas en risa.liberada.net.

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

#### Eliminado

- **`authy.js`**: eliminado; la identidad v1 se resuelve con `key` + hash salado
  en `logic.mjs`. La capa completa authy (claim L2→L3, niveles L3–L5) queda
  para v2 (plan-v2.md).

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
