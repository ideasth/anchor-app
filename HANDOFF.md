# Handoff notes — Anchor

Living document. Append new entries at the top. Each entry: date (AEST), thread summary, status, follow-ups.

---

## 2026-05-08 (12:55 AEST) — Repo public; admin endpoints rebuilt; `publish_website` STILL gated

**Completed**
- Repo `ideasth/anchor-app` is now PUBLIC. Default branch swapped to `main` at `ccb5a8c`. Stale `master` deleted from origin. AUPFHS URL fully scrubbed from history (`git filter-repo`).
- Anonymous clone confirmed working: `git clone https://github.com/ideasth/anchor-app.git` (no creds, no proxy).
- Built `dist/public/assets/index-OJD7pA68.js` + `dist/index.cjs` (1018kb, all 3 admin endpoints present: export/import/status). Build steps: ensure `/home/user/workspace/.secrets/anchor_sync_secret` exists → write `server/baked-secret.ts` (gitignored) with `export const BAKED_SYNC_SECRET = "<secret>";` → `npm ci && npm run build`.
- Cron `f04511c0` updated with Cloudflare User-Agent workaround (every Anchor API call must send `User-Agent: anchor-cron/1.0 (perplexity-cron)` — Python urllib default UA is blocked by CF rule 1010 with HTTP 403). Schedule unchanged.

**STILL BLOCKED — production deploy**
- `publish_website` returned `{"error":"Website publishing is not enabled"}` in this thread again. `deploy_website` (preview-only) works, but only updates static S3 assets — the running server on `anchor-jod.pplx.app` keeps the OLD bundle (`index-zFvB7OZP.js` + admin endpoints absent).
- Same root cause as diagnostic `9a2f2c0a-7c54-4eb2-a1df-cd53f7823aac`. Open a fresh thread to pick up the publish.

**Next thread — exact steps to deploy**
```
# 1. Recreate secret if not present.
# The literal value lives in the space Instructions block (Bootstrap section) and
# is NOT in this repo. The space's bootstrap rule writes it to the path below at
# the start of any thread. If you're running this manually, copy the value from
# the space Instructions, then:
#   mkdir -p /home/user/workspace/.secrets
#   printf '%s' '<paste-secret-from-space-instructions>' > /home/user/workspace/.secrets/anchor_sync_secret
#   chmod 600 /home/user/workspace/.secrets/anchor_sync_secret
# In a thread that auto-bootstraps, just run:
ls /home/user/workspace/.secrets/anchor_sync_secret  # should already exist

# 2. Clone (NO credentials needed — repo is public)
git clone https://github.com/ideasth/anchor-app.git /home/user/workspace/anchor
cd /home/user/workspace/anchor

# 3. Bake secret (file is gitignored)
SECRET=$(cat /home/user/workspace/.secrets/anchor_sync_secret)
cat > server/baked-secret.ts <<EOF
export const BAKED_SYNC_SECRET = "$SECRET";
EOF

# 4. Build
npm ci && npm run build

# 5. Publish (re-use existing site_id)
publish_website(
  project_path="/home/user/workspace/anchor",
  dist_path="/home/user/workspace/anchor/dist/public",
  app_name="Anchor — Oliver Daly",
  install_command="npm ci --omit=dev",
  run_command="NODE_ENV=production node dist/index.cjs",
  port=5000,
  site_id="77eb73a0-40d8-4ae2-9a78-4239f106294b",
  # NO credentials param — secret is baked. Per standing rule.
)

# 6. Verify
SECRET=$(cat /home/user/workspace/.secrets/anchor_sync_secret)
curl -sS -H "X-Anchor-Sync-Secret: $SECRET" https://anchor-jod.pplx.app/port/5000/api/admin/db/status
# Expected: JSON with dbPath, sizeBytes, importEnabled — NOT SPA HTML

# 7. First fresh DB snapshot
curl -sS -H "X-Anchor-Sync-Secret: $SECRET" \
  https://anchor-jod.pplx.app/port/5000/api/admin/db/export \
  -o /home/user/workspace/anchor-data-backup-fresh.db
```

**AUPFHS_ICS_URL note**: not currently set as a publish env var. The calendar feed will silently use empty string until set. The URL itself is at `/home/user/workspace/.secrets/aupfhs_ics_url`. If user wants it active in production, add it via the platform's env config (publish_website does NOT take arbitrary env vars; supabase-only `credentials` param is a different mechanism).

---

## 2026-05-08 (later) — Admin DB export/import endpoints

**What was added** (commit pending — see `server/admin-db.ts`):
- `GET  /api/admin/db/export` — streams a consistent SQLite snapshot via better-sqlite3's online `.backup()`. Auth: `X-Anchor-Sync-Secret`.
- `POST /api/admin/db/import` — accepts raw SQLite bytes (Content-Type: application/octet-stream), validates magic header + `PRAGMA integrity_check`, backs up current DB to `data.db.bak.<timestamp>`, atomic rename. Auth: `X-Anchor-Sync-Secret`. **Gated by `ANCHOR_DB_IMPORT_ENABLED=1` env var (off by default — kill switch).** Returns `{ restartRequired: true }`; the server must be restarted (re-publish) for the new DB to take effect.
- `GET  /api/admin/db/status` — returns `{ dbPath, exists, sizeBytes, importEnabled }`. Sanity check from a new thread.
- `server/storage.ts` now exports `rawSqlite` so admin endpoints can call `.backup()` on the live handle.

**Build status**: client + server bundles built successfully (`dist/public/assets/index-OJD7pA68.js` + `dist/index.cjs`). All three endpoints confirmed in the server bundle.

**Publish status**: NOT YET DEPLOYED to `anchor-jod.pplx.app`. The `publish_website` tool was not available in this thread (same cached-capability issue as ticket `9a2f2c0a-7c54-4eb2-a1df-cd53f7823aac`). Next thread needs to: clone, `npm ci && npm run build`, then run the `publish_website` flow with the standing args.

**How to use export from a new thread (after publish)**:
```
SECRET=$(cat /home/user/workspace/.secrets/anchor_sync_secret)
curl -sS -H "X-Anchor-Sync-Secret: $SECRET" \
  https://anchor-jod.pplx.app/port/5000/api/admin/db/export \
  -o /home/user/workspace/anchor-data-backup.db
```

**How to use import** (DESTRUCTIVE):
1. Set `ANCHOR_DB_IMPORT_ENABLED=1` in the publish env (via `run_command` env or platform config).
2. Re-publish so the env var is active.
3. POST the file:
   ```
   curl -sS -X POST \
     -H "X-Anchor-Sync-Secret: $SECRET" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @anchor-data-backup.db \
     https://anchor-jod.pplx.app/port/5000/api/admin/db/import
   ```
4. Re-publish (or restart) so the running better-sqlite3 handle reopens against the swapped DB file.
5. Disable again: remove `ANCHOR_DB_IMPORT_ENABLED` and re-publish.

**Standing rule update**: "Touch `data.db` after extraction" → import endpoint is the sanctioned way to do this; it leaves a `.bak.<timestamp>` rollback. Still requires explicit user approval per run.

---

## 2026-05-08 — Cross-thread continuity setup (Option B)

**What happened**
- Set up `github.com/ideasth/anchor-app` (private) as the source-of-truth repo so any thread in the Life Management space can clone, build, and publish.
- Updated `CONTEXT.md` and the space's Instructions block with a bootstrap step (recreate `.secrets/anchor_sync_secret`) and a clone step (`gh repo clone ideasth/anchor-app /home/user/workspace/anchor`).
- Initial commit `23903ea` contains the calendar bug fix (CalendarPlanner.tsx — added `couple` key to `COL_DEFS` plus defensive guards) and is ready to publish.

**Calendar bug — fix is in the repo, not yet on live**
- File: `client/src/pages/CalendarPlanner.tsx`
- Fix: added `{ key: "couple", label: "Couple", group: "couple" }` to `COL_DEFS` and defensive guards for `dayMap[col]` and `dayMap.family_notes`.
- Built bundle in last thread: `dist/public/assets/index-OJD7pA68.js`. New threads should rebuild fresh.
- **Action for next thread**: open a new thread, clone+build+publish to push the fix to `https://anchor-jod.pplx.app`. The "Website publishing is not enabled" error in the previous thread was a cached capability check; new threads should not hit it.

**Outstanding decisions (non-blocking)**
1. Family email addresses for cron `f04511c0` priority filter — only Marieke confirmed so far. Other family senders TBD.
2. Epworth treatment emails — always priority / never / only if direct? TBD.

**Cron status (latest verified runs)**
- `a6c5cc04` (Outlook + capture bridge): run #24 at 06:49 AEST 2026-05-08, ok=true. State at `/home/user/workspace/anchor-cron-state/seen.json` (outlook=154, capture=0). Note: this state file is NOT in the repo and resets per thread.
- `f04511c0` (email status pull): ran successfully at 06:03 AEST 2026-05-08 with 0 priority emails. Cron prompt has verified Outlook connector syntax (`in:sent` returns thread_id = conversationId for O(1) reply detection) baked into the latest cron body.
- `33d5581b` + `51e88e18` (calendar): ran successfully overnight.

**Diagnostic ticket open**
- `9a2f2c0a-7c54-4eb2-a1df-cd53f7823aac` — `publish_website` returned "Website publishing is not enabled" repeatedly in cached threads. Workaround: open a new thread.

**What does NOT travel between threads (be aware)**
- `data.db` — production DB lives on the deployed sandbox; threads start empty unless they pull from the API.
- `/home/user/workspace/anchor-cron-state/seen.json` — FIFO dedup state for cron `a6c5cc04`. Resets per thread.
- `/home/user/workspace/anchor-cron-state/sent_style_sample.json` — TTL 24h style cache for cron `f04511c0`. Re-fetched on next run.
- `/home/user/workspace/cron_tracking/` — per-cron tracking files. Local only.
- `server/baked-secret.ts` — gitignored; regenerated at publish time from `.secrets/anchor_sync_secret`.
