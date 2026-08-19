# Changelog

Registro de cambios de **Risa Liberada** (repo `floveorg/risa`).
Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) ·
versionado `v1.x.y` · política de versiones y retrocompatibilidad en
[VERSIONING.md](VERSIONING.md).

> **v1.0.0 cortada.** «Nick as tag»: tu nickname se convierte en tu etiqueta
> (tag-url `#/u/<key>`) y, con permiso, en tu subdominio `<username>.liberada.net`.
> El paquete descargable incluye versión, ciclo de release y el manual de uso.

## [v1.0.7] — 2026-08-18 · usuarios reales (imaginarios) + cadenas + subdominios

- **Cinco usuarios de la comunidad (demos con nombre español)** sustituyen a los
  demos de juguete (`contagiosa` · `carcajada` · `mundo`): **Ana Pérez**, **Carlos
  Ruiz**, **Laura Díaz**, **Pedro López** y **Sofía Torres**. Cada uno tiene perfil
  agregador propio (`liberada.net/usa/<user>/`), bio, redes y aliases públicos.
  Se retira la etiqueta «Demo 😄» de esos perfiles.
- **Clips de «Risas del mundo» subidos como respuestas en cadenas del feed.**
  14 clips de Commons se añaden a `risa.json` con `parent` sobre clips reales
  (Risa Maliciosa · Aahh · Surreal · Nosnormal), formando 4 hilos anidados de
  hasta 3 niveles. El feed las muestra indentadas y la pestaña Cadenas de cada
  perfil pinta el hilo completo en el que participa (los ajenos se ven atenuados).
- **Audio de las playlists reparado**: los ficheros `risa/seed/audio/*` nunca se
  subieron a R2 (404). Todas las playlists (contagiosa · carcajada · pícara ·
  risita · mundo) y el perfil de maria ahora apuntan a las fuentes con licencia
  en Wikimedia Commons (`Special:FilePath/…`), reproducibles sin espejo R2.
- **Subdominios automáticos**: la plantilla de perfil resuelve el usuario desde
  el `Host` (`<user>.liberada.net`) además del path, y el Worker sirve la
  plantilla genérica para cualquier username de `usernames.json` sin carpeta
  propia — el opt-in del bot (Sí al subdominio) ya activa el enlace de autor.
- **maria/marcflove**: se quita el salto forzoso a `<user>.liberada.net` (que
  caía en página de error sin DNS); el `index.html` raíz de liberada.net
  redirige ahora cualquier subdominio CNAMEado al perfil del usuario.
- `risa.json` + `risa.xml`/`atom.xml` regenerados (28 clips).

## [v1.0.6] — 2026-08-18 · fix: vídeo-notas circulares no reconocidas

- **Los vídeo-notas («mantener pulsado», círculo) se ignoraban en silencio.**
  `parseUpdates` solo miraba `msg.voice | msg.audio | msg.video`; un
  `msg.video_note` caía fuera y el bot no creaba borrador. Ahora se tratan como
  vídeo (`video: true`), se comprimen a MP4 al publicar y entran en el circuito.
- Test añadido; `risa103.zip` regenerado.

## [v1.0.5] — 2026-08-18 · fix: flujo de borrador (título/tags/autor/enviar)

- **El borrador se perdía entre corridas del cron.** `state/drafts.json` y
  `state/.uploaders.json` estaban en `.gitignore`: cada ejecución de Actions
  arrancaba sin borradores, así que al pulsar «Enviar», «Autor»… no se
  encontraba el borrador (botones muertos) y los textos de título/tags caían en
  la bienvenida.
- **Fix**: esos dos ficheros se persisten ahora en el repo con los **ids de
  chat ofuscados** (`encChatId`/`decChatId`: XOR con clave derivada de
  `TG_ID_SECRET`, reversible solo con el secret — nunca en claro), y el cron
  los conserva entre corridas. El flujo completo subir→editar→enviar funciona.
- Tests `encChatId/decChatId` añadidos; `risa103.zip` regenerado.

## [v1.0.4] — 2026-08-18 · fix crítico: el bot no respondía

- **El bot @RisaLiberadaBot no procesaba mensajes.** Desde v1.0.2,
  `bot/poll.mjs` importaba `clipsOf` de `./logic.mjs`, que **no lo exportaba**
  (vive en `risa.js`) → el bot moría al arrancar (`SyntaxError`) y el cron de
  Actions fallaba en cada tick: nadie respondía y las updates quedaban
  pendientes.
- **Fix**: `clipsOf` (extracción array u `{schema,clips}` del feed) añadido a
  `logic.mjs` con su test. El bot vuelve a procesar: verificado localmente
  (procesó la update pendiente y avanzó el offset).
- `risa103.zip` regenerado con el fix.

## [v1.0.3] — 2026-08-18 · **pack v1 congelado**

- **Pack descargable congelado**: `risa103.zip` es el paquete
  definitivo de v1 — todo el circuito «Nick as tag» tal como está en `main`
  (web single-file con **i18n es/en** y tema, miniapp, subdominios opt-in,
  RSS/Atom, CI, a11y axe 0, schema `risa-feed/1`). A partir de aquí, **v1 no
  cambia su espíritu**: un solo perfil como tag (`#/u/<key>`), nada de
  identidad/claims — eso vive en `v2-d1`.
- Las actualizaciones futuras de la descarga v1 serán **fixes o mejoras no
  fundamentales** (texto, UX, a11y, accesibilidad) que no toquen el núcleo;
  cada una corta su propia release `v1.0.x` y regenera el pack con
  `./build-risa-zip.sh`.

## [v1.0.2] — 2026-08-18 · a11y · feeds · CI · schema

- **Auditoría axe completa: 0 violaciones** (antes 69). `<h1>` sr-only,
  `aria-label` en las 10 secciones (regiones), y `--persimmon` oscurecido a
  `#c03610` por contraste WCAG AA.
- **RSS/Atom del feed**: `build-rss.mjs` genera `risa.xml` + `atom.xml`
  (RSS 2.0 y Atom 1.0); el bot los regenera al publicar y se enlazan en el
  `<head>` de la web.
- **og:image PNG real**: `media/logos/15-guino.png` (512×512, renderizado del
  mark SVG) en vez del SVG que varía según plataforma.
- **CI de tests en cada push/PR**: `.github/workflows/test.yml` corre
  `node --test`, `node --check` y `html-validate` (gate automático, no solo en
  release).
- **Schema explícito en `risa.json`**: formato `{ "schema": "risa-feed/1",
  "clips": […] }`, retrocompatible (la web y el bot leen con `clipsOf`; el bot
  escribe siempre el objeto). Migración documentada en `VERSIONING.md`.

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
