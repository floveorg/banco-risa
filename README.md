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
- `TG_ID_SECRET` — salt for the obfuscated Telegram-id hash (sha256) stored in `state/queue.json`; the id itself is never committed in the clear (DM ids live in gitignored `state/.uploaders.json`)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_BASE` — Cloudflare R2 upload

Note: free-tier scheduled workflows are best-effort (5–15 min latency; they pause after
60 days of no repo activity — any push resets that).

License of published clips: **CC BY-SA 4.0**.

## Versioning

- **v1 = production** (this repo, frozen except fixes) · **v2 = development** (flove central: authy, lovy, `central/users/`).
- Releases: `CHANGELOG.md` + tag `v1.x.y` — see [VERSIONING.md](VERSIONING.md) for the scheme, backwards-compat contract and release logics.
