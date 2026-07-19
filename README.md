# Banco de la risa — bot

Serverless Telegram moderation bot for [Risa Liberada](https://flove.org). People DM their
laugh to **@RisaLiberadaBot**; moderators approve/reject in the private group *Risas Nuevas*;
approved clips land in `banco.json` + `audio/` (served by GitHub Pages) and the public channel
[t.me/risaliberada](https://t.me/risaliberada). Runs on a GitHub Actions cron — no server.

- `bot/logic.mjs` — pure update->actions logic (tested)
- `bot/telegram.mjs` — thin Bot API client
- `bot/poll.mjs` — orchestrator run each cron tick
- `.github/workflows/poll.yml` — the cron
- Data: `banco.json` (published clips, newest-first), `audio/*.mp3`, `state/` (offset + pending queue)

License of published clips: **CC BY-SA 4.0**.
