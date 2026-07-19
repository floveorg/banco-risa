# Banco de la risa — bot

Serverless Telegram moderation bot for [Risa Liberada](https://flove.org). People DM their
laugh to **@RisaLiberadaBot**; moderators approve/reject in the private group *Risas Nuevas*;
approved clips are uploaded to **Cloudinary** and indexed in `banco.json` (served by GitHub
Pages), plus posted to the public channel [t.me/risaliberada](https://t.me/risaliberada).
Runs on a GitHub Actions cron — no server.

Audio (the community-uploaded laugh clips) lives on Cloudinary, not in git; the repo holds
only the metadata (`banco.json`, each entry's `src` is a Cloudinary URL) and the bot code.

- `bot/logic.mjs` — pure update->actions logic (tested)
- `bot/telegram.mjs` — thin Bot API client
- `bot/cloudinary.mjs` — zero-dep signed upload (audio → Cloudinary)
- `bot/poll.mjs` — orchestrator run each cron tick
- `.github/workflows/poll.yml` — the cron
- Data: `banco.json` (published clips, newest-first), `state/` (offset + pending queue)

Secrets (GitHub Actions repository secrets, never committed):
- `TELEGRAM_BOT_TOKEN` — the @RisaLiberadaBot token
- `CLOUDINARY_URL` — `cloudinary://<api_key>:<api_secret>@<cloud_name>`

Note: free-tier scheduled workflows are best-effort (5–15 min latency; they pause after
60 days of no repo activity — any push resets that).

License of published clips: **CC BY-SA 4.0**.
