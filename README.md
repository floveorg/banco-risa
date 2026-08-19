# Risa Liberada — bot

Serverless Telegram moderation bot for [Risa Liberada](https://flove.org). People DM their
laugh to **@RisaLiberadaBot**; a fixed welcome message greets them («Comparte tu risa con todos
aquí. Graba tu risa (y dale a enviar), elige visibilidad y descríbela, envía, (moderación),
recibe notificación de publicación en @risaliberada y risa.liberada.net»), and every audio opens a *draft*
card: **✏️ Título** + **🏷️ Tags** in one row, attribution (**👤 Usuario telegram** and
**🙂 Autor** are multi-select, **🙈 Anónimo** overrides both) in another, and **✅ Enviar** in
a third. Tags are free text (comma-separated). Files are capped at 10 MB / 1000 s.
Once sent, moderators approve/reject in the private group *Risas Nuevas* — the mod message
carries the title + tags as hashtags (searchable in Telegram). Approved clips are uploaded
to **Cloudflare R2** and indexed in `risa.json` (`src` = R2 URL, plus `t` title and `tags`),
and posted to the public channel [t.me/risaliberada](https://t.me/risaliberada) with the clip
title attached. On approval the bot tells the uploader what they submitted (title, tags,
name) — no media link. Clips wait for a moderator decision (no auto-publish).
Runs on a GitHub Actions cron — no server.

Audio — the community-uploaded laugh clips **and** the seed laugh library — lives on Cloudflare
R2, never in git; the repo holds only the metadata (`risa.json`, each entry's `src` is an R2 URL)
and the bot code. The seed clips play straight from their R2 seed path.

## Web app

The risa web app (`index.html` + the rishaman demos) lives at the repo root. Its media — the app
photos (`media/`, including the logo family under `media/logos`) and the personal
gallery (`categorias/`) — is synced to Cloudflare R2 under `risa/…` by `bot/sync-media.mjs`
(.github/workflows/sync-media.yml), and the pages reference those absolute R2 URLs. The app is
served at https://risa.liberada.net (GitHub Pages of this repo) and fetches
this repo's `risa.json` feed as its published-risas data.

- `bot/logic.mjs` — pure update->actions logic (tested)
- `bot/telegram.mjs` — thin Bot API client
- `bot/r2.mjs` — zero-dep SigV4 signed upload (audio → Cloudflare R2)
- `bot/poll.mjs` — orchestrator run each cron tick
- `.github/workflows/poll.yml` — the cron
- Data: `risa.json` (published clips, newest-first), `state/` (offset + queue + drafts)

Secrets (GitHub Actions repository secrets, never committed):
- `TELEGRAM_BOT_TOKEN` — the @RisaLiberadaBot token
- `TG_ID_SECRET` — salt for the obfuscated Telegram-id hash (sha256) stored in `state/queue.json`; the id itself is never committed in the clear. DM ids in `state/drafts.json` and `state/.uploaders.json` are persisted **obfuscated** (`encChatId`: XOR with a key derived from `TG_ID_SECRET`, reversible only with the secret) so the cron keeps draft state between runs without leaking ids.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_BASE` — Cloudflare R2 upload

Note: free-tier scheduled workflows are best-effort (5–15 min latency; they pause after
60 days of no repo activity — any push resets that).

License of published clips: **CC BY-SA 4.0**.

## Versioning

- **Risa 2.x** = la versión actual. `risa2.zip` es la descarga que **siempre trae la última Risa 2.x.x**; las cortadas concretas se nombran `risa2.<x.y>.zip` (risa2.0.1, risa2.1.3, …).
- **v1 = production** (esta generación anterior, congelada) · **v2-central** (rama) = la web se construye sobre `central/shared/code`.
- Releases: `CHANGELOG.md` + tag `v2.x.y` — ver [VERSIONING.md](VERSIONING.md).
- Manual de uso del entorno real (web, bot, miniapp, privacidad): [MANUAL.md](MANUAL.md).
- Paquete descargable: **`risa2.zip`** (regenerable con `./build-risa-zip.sh`).

## Changelog

### Risa 2.1.0 · hito «Calling libs» (rama `v2-central`)

- `risa/index` abandona el monolito y llama a las libs centrales (`central/shared/code`: flove-feed · flove-tags · flove-player · flove-bottom-nav · flove-sound · flove-app).
- Menú del logo reparado (el dropdown abre de verdad al pulsar el logo).
- Media toggle acumulativo audio/vídeo (checks independientes; ya no desaparece la playlist).
- «Risas del mundo» vuelve a la playlist curada (scrapped de Wikimedia Commons); fuera los clips subidos por el bot.
- En las listas, el enlace «original» aparece tras las etiquetas y lleva a la url del clip.
- Tags flotantes contenidas en su columna (sin invadir la playlist).
- Descarga: `risa2.zip` = última Risa 2.x.x.

### Risa 2.0.0 · versión anterior congelada

- `index.html` monolítico (todo inline, sin libs centrales), playlists scrapped de Commons, menú de logo presente.
- Congelada como punto de partida del changelog 2.x y de la descarga v2.
