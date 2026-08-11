# Banco de la risa — bot

Serverless Telegram moderation bot for [Risa Liberada](https://flove.org). People DM their
laugh to **@RisaLiberadaBot**; a fixed welcome message greets them («Actívame para compartir
tu risa con el mundo, de forma anónima o con tu identidad»), and every audio opens a *draft*
card: **✏️ Título** + **🏷️ Tags** in one row, attribution (**👤 Usuario telegram** and
**🙂 Autor** are multi-select, **🙈 Anónimo** overrides both) in another, and **✅ Enviar** in
a third. Tags are free text (comma-separated). Files are capped at 10 MB / 1000 s.
Once sent, moderators approve/reject in the private group *Risas Nuevas* — the mod message
carries the title + tags as hashtags (searchable in Telegram). Approved clips are uploaded
to **Cloudflare R2** and indexed in `banco.json` (`src` = R2 URL, plus `t` title and `tags`),
and posted to the public channel [t.me/risaliberada](https://t.me/risaliberada) with the clip
title attached. On approval the bot tells the uploader what they submitted (title, tags,
name) — no media link. Clips wait for a moderator decision (no auto-publish).
Runs on a GitHub Actions cron — no server.

Audio (the community-uploaded laugh clips) lives on Cloudflare R2, not in git; the repo holds
only the metadata (`banco.json`, each entry's `src` is an R2 URL) and the bot code.

- `bot/logic.mjs` — pure update->actions logic (tested)
- `bot/telegram.mjs` — thin Bot API client
- `bot/r2.mjs` — zero-dep SigV4 signed upload (audio → Cloudflare R2)
- `bot/poll.mjs` — orchestrator run each cron tick
- `.github/workflows/poll.yml` — the cron
- Data: `banco.json` (published clips, newest-first), `state/` (offset + queue + drafts)

Secrets (GitHub Actions repository secrets, never committed):
- `TELEGRAM_BOT_TOKEN` — the @RisaLiberadaBot token
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_BASE` — Cloudflare R2 upload

Note: free-tier scheduled workflows are best-effort (5–15 min latency; they pause after
60 days of no repo activity — any push resets that).

License of published clips: **CC BY-SA 4.0**.
