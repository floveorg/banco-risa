# Risa liberada v1 · Manual de uso

**Versión del paquete:** v1.0.0 · **nombre interno:** *Nick as tag* — tu nickname
se convierte en tu etiqueta (tag-url `#/u/<key>`) y, con permiso, en tu
subdominio `<username>.liberada.net`.

Este manual cubre el entorno real: la web (`risa.liberada.net`), el circuito
Telegram (subir → moderar → publicar) y la miniapp de perfil. Para montar una
réplica desde cero, ver [README.md](README.md) y [VERSIONING.md](VERSIONING.md).

---

## 1. La web — risa.liberada.net

- **Playlists.** «Risas del mundo» (biblioteca libre de Commons) y «Risas de la
  gente» (lo que la comunidad sube). Un reproductor comparte play/pausa,
  anterior/siguiente y lista de pistas.
- **Chips de etiquetas.** Pulsa un chip para filtrar la playlist; el botón `+`
  revela más etiquetas flotantes (hasta 60). Busca por título, etiqueta o
  nombre en el campo de búsqueda.
- **Favoritos.** La estrella ⭐ guarda tus risas en tu navegador (filtro local).
- **Página de autor `#/u/<key>`.** Cada clip publica enlaza a la página del
  autor con todas sus risas. Si el autor activó su subdominio, el botón
  «Username →» lleva a `<username>.liberada.net`.
- **Demo «Pasado · presente · futuro».** Presenta la evolución del perfil:
  pasado (página larga dentro de risa), presente (`marcflove.liberada.net`,
  activo) y futuro (`maria.liberada.net`).
- **Accesibilidad.** `prefers-reduced-motion`, navegación por teclado,
  `aria-label`, contraste alto.

## 2. El bot — @RisaLiberadaBot

En un chat privado con el bot:

| Comando | Qué hace |
|---|---|
| `/start` | Bienvenida con las reglas (1 min · 10 MB · 5/día) |
| `/entrar` | Abre tu perfil (miniapp) o pide un código para la web |
| `/mejorar` | Novedades del proyecto |
| `/usuario <nombre>` | Tu subdominio `<nombre>.liberada.net` |
| `/name <nombre>` | Tu nombre público |
| `/pub` | Mostrar u ocultar tu @ de Telegram en la web |
| `/me` · `/stats` · `/status` | Tu página, stats y estado del circuito |
| `/latest` · `/random` · `/trending` | Explorar el feed |
| `/play` | Reproducir el feed |

### Subir una risa

1. Graba una **nota de voz** o un **vídeo** de máx. 1 min (10 MB).
2. El bot abre una tarjeta de borrador: edita **título** y **etiquetas**, elige
   la visibilidad (**👤 Usuario telegram**, **🙂 Autor**, **🙈 Anónimo**) y
   pulsa **✅ Enviar**.
3. Un moderador la revisa; si entra, se publica en @risaliberada y en la web.
   Recibirás el aviso con el enlace a tu página y la oferta de subdominio:
   **Sí, quiero / No sé / No, seguro** (opt-in, nunca automático).

### Moderación (grupo privado)

- **✅ Publicar** / **🗑 Borrar** / **✏️ Editar** (propuesta con visto bueno del
  autor). También por palabra en una respuesta: «ok», «sí», «no», «borrar»…

## 3. Miniapp de perfil — risa.liberada.net/#/entrar

- Pide un **código de 6 dígitos** con `/entrar` en el bot («Código por el bot»).
- El código se liga a tu identidad (hash, nunca tu id en claro) y caduca al
  final del día.
- Con el código ves tu perfil: nombre público, subdominio y el panel
  **«Activa tu perfil en <tu>.liberada.net»** (Editar · bio extendida · juega y
  filtra). El enlace redirige a tus últimas risas en tu nuevo perfil.
- Editar se aplica desde el bot (`/name`, `/usuario`); el email como vía de
  recuperación llega pronto.

## 4. Datos y privacidad

- El feed es `risa.json` (repo público): `id · t · name · tags · src · when ·
  tg · key`. Nunca contiene ids de Telegram en claro.
- El id real queda tras un **hash salado** (`TG_ID_SECRET`); la identidad
  pública es tu nombre/palabra más la `key`.
- Licencia de cada pieza: **CC BY-SA 4.0** («Enviar = consentir»).
- Audios y vídeos viven en **Cloudflare R2** con URL pública; el repo solo
  guarda el metadato.

## 5. Mantenimiento y fallos

- El circuito corre con un **cron de GitHub Actions** (5–10 min); si se para,
  cualquier push al repo lo reactiva.
- `state/` guarda offset y cola; `state/drafts.json` y `state/.uploaders.json`
  son locales y no se publican.
- Secretos (nunca en el repo): `TELEGRAM_BOT_TOKEN`, `TG_ID_SECRET`, `R2_*`.

---
Para el ciclo de releases y el versionado, ver [VERSIONING.md](VERSIONING.md).
