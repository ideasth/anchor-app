# Buoy

## What is Buoy?

Buoy is a personal life-management app: tasks, journal, scheduling, and three short Coach modes (Plan, Reflect, Calm). It's the author's personal tool, made public for portability and curiosity.

## Running your own

Clone the repo, install dependencies, set `BUOY_SYNC_SECRET` to a random string in the environment, build the bundle, run it on port 5000, and point a reverse proxy (Caddy, nginx, Cloudflare Tunnel) at it. Concretely: `git clone https://github.com/ideasth/buoy-app.git && cd buoy-app && npm ci && BUOY_SYNC_SECRET=$(openssl rand -hex 32) npm run build && node dist/index.cjs`. The legacy `ANCHOR_SYNC_SECRET` env var and `X-Anchor-Sync-Secret` header are still accepted during the rename transition.

The LLM key is set in the in-app settings on first run, not via env vars. Only the supported providers will work — Perplexity is the only adapter today; more (Anthropic, Ollama, others) are planned. Bring your own key.

The database is SQLite and lives at `data.db` next to the binary. Migrations run automatically on boot — there is no separate migration command. Back it up yourself if you care about your data; the app does not include hosted backup.

## Licence and posture

AGPL v3 (see `LICENSE`). This is the author's personal project. PRs may be ignored. There is no support. Forks are welcome.
