# Stage 19 — Sibling service LLM proxy (1C + 2C, two siblings)

**Status:** Signed off 2026-05-16 AEST. Implementing now.
**Date:** 2026-05-16 (AEST).
**Owner:** Oliver Daly.

## Summary

Two sibling services (`marieke-buoy` and `lachie-buoy`, both planned to live on the same VPS as Buoy at `203.29.240.189`) need an LLM. Rather than give each sibling its own LLM client and its own API key, Buoy gains a small **LLM proxy endpoint** at `POST /api/llm/chat`. Siblings make localhost HTTP calls to that endpoint. Buoy holds the only Perplexity API key, looks it up via the existing `LLMAdapter` abstraction (`server/llm/adapter.ts`), and dispatches.

This is the **1C + 2C** pairing — pluggable provider, Buoy holds the only key — adapted to the fact that all services live on the same host, and that there are two callers from day one.

## Scope (Option A)

Stage 19 is **Buoy-side only**. It does **not** stand up Caddy vhosts or DNS for `marieke-buoy.thinhalo.com` / `lachie-buoy.thinhalo.com`. Those come later, with each sibling's own deployment stage. The proxy is loopback-only so it doesn't need public DNS to work.

## Goals

1. Each sibling can ask Buoy for an LLM completion without holding any LLM credentials of its own.
2. One rotation point: changing the Perplexity key on the VPS only requires touching Buoy.
3. The provider behind the proxy is swappable (Perplexity Sonar today; OpenAI / Anthropic / local Ollama later) by changing one env var, with no sibling code changes.
4. The proxy is locked down to **same-host callers only**. The Internet must never reach `/api/llm/chat`.
5. Each sibling has its own secret, its own identifier, and its own rate-limit bucket. A noisy or compromised sibling cannot starve or impersonate the other.
6. Buoy gains per-sibling request logging so we can see exactly what `marieke-buoy` or `lachie-buoy` has asked the LLM today.

## Non-goals

1. Per-user authentication. The proxy is system-to-system on the loopback interface, not user-facing.
2. Streaming responses to the sibling. v1 is JSON-in / JSON-out. Streaming is a follow-up if the sibling's UX needs it.
3. Multi-tenant rate limiting. v1 has a single shared cap; per-sibling quotas are a follow-up.
4. Touching how Buoy itself uses the LLM (Coach, scheduling-parser, coach-summary-backfill all keep calling `getPerplexityAdapter()` directly).
5. Changing how Buoy's existing API key is stored or rotated.

## Architecture

```
marieke-buoy  ──HTTP──┐
(localhost:Px)         │
                       ├──> Buoy  ──HTTPS──>  Perplexity Sonar
lachie-buoy   ──HTTP──┘   (localhost:5000)    (api.perplexity.ai)
(localhost:Py)             │
                           └── reads PERPLEXITY_API_KEY via
                               existing LLMAdapter abstraction
```

- All three processes live on the same VPS.
- Sibling → Buoy calls go over `127.0.0.1:5000`. No TLS, no public DNS, no Caddy hop.
- Buoy → upstream LLM calls are unchanged from today.
- Neither sibling has, sees, or imports an LLM key.
- Sibling identity is asserted by an `X-Sibling-Id` header and authenticated by an `X-Sibling-Auth` header carrying a per-sibling secret.

## Endpoint contract

### `POST /api/llm/chat`

Required headers:
- `X-Sibling-Id`: one of the registered sibling IDs (`marieke-buoy`, `lachie-buoy`).
- `X-Sibling-Auth`: the secret for that sibling. Constant-time compared.
- `Content-Type: application/json`.

Request body:
```json
{
  "model": "sonar-pro",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.4,
  "maxTokens": 1200,
  "disableSearch": true
}
```

- `model`: required. Must match the per-provider allow-list (see "Model allow-list" below). An unknown model returns `400 invalid_model`. Default for siblings is `sonar-pro`.
- `messages`: required, non-empty array. Same shape as `CoachMessage` in `server/llm/adapter.ts`.
- `temperature`: optional, 0.0–1.0. Default `0.4`.
- `maxTokens`: optional, integer 1–4000. Default `1200`. Hard cap `4000` so a runaway sibling can't ask for 100k tokens.
- `disableSearch`: optional boolean. Defaults to `true` for the proxy (the sibling is expected to be grounded in its own context, like Coach is).

Response (200):
```json
{
  "text": "...the LLM response...",
  "model": "sonar-pro",
  "usage": { "inputTokens": 312, "outputTokens": 488 },
  "citations": ["https://...", "..."]
}
```

Error responses (all JSON, `error` field):
- `400 invalid_model` — model not in the allow-list.
- `400 invalid_request` — messages missing/empty, temperature out of range, maxTokens > 4000, body not JSON.
- `401 forbidden` — caller failed the loopback gate, the sibling ID is unknown, or the secret didn't match. The body says only `forbidden` — it does not distinguish the three sub-cases so a probe can't tell which gate failed.
- `429 rate_limited` — the calling sibling exceeded its per-sibling cap. Includes `Retry-After`.
- `502 provider_error` — upstream LLM returned non-2xx. Body includes upstream status code and a short reason.
- `503 provider_unavailable` — no key configured (`isAvailable()` returned false).

### `GET /api/llm/health`

Returns `{ "available": true, "provider": "perplexity", "models": ["sonar-pro", "sonar", "sonar-reasoning-pro"] }`. Loopback-only (same gate as `/chat`), but no `X-Sibling-Auth` required — used by either sibling at boot to confirm the proxy is up. Returns `{ available: false }` if no key is configured. **Does not** expose the key or any env var name.

## Access control

Three cheap, layered gates. All must pass.

### Gate 1 — Loopback only

The route handler checks `req.ip`. Reject anything that isn't `127.0.0.1`, `::1`, or `::ffff:127.0.0.1` with `401 forbidden`. Caddy never proxies `/api/llm/*` to any public hostname (see "Caddy" below) so this gate is belt-and-braces — the request shouldn't physically be able to arrive from off-host, but if a future Caddy edit breaks that assumption, the handler still refuses.

Trust proxy must be configured on Express so `req.ip` reflects the actual loopback caller, not the (non-existent) upstream proxy. Buoy already runs without a `trust proxy` setting in front of Caddy; the proxy endpoint relies on this. The unit tests cover the IP-matching logic directly so we don't depend on Express internals.

### Gate 2 — Known sibling identifier

The caller must include `X-Sibling-Id`. The handler looks the ID up in the sibling registry (`server/llm/sibling-registry.ts`). Unknown ID → `401 forbidden` with no further detail.

v1 registry:
- `marieke-buoy` → reads its secret from env var `MARIEKE_BUOY_PROXY_SECRET`.
- `lachie-buoy` → reads its secret from env var `LACHIE_BUOY_PROXY_SECRET`.

### Gate 3 — Per-sibling shared secret

Sibling sets `X-Sibling-Auth: <token>`. Buoy compares against the secret registered for the sibling ID using **constant-time compare** (`crypto.timingSafeEqual`). Missing, empty, or mismatched → `401 forbidden`.

- Each secret is independent. `marieke-buoy`'s secret and `lachie-buoy`'s secret are different values.
- Neither is the same as Buoy's `X-Anchor-Sync-Secret` (which is for calendar sync). New, dedicated, scoped to LLM proxy access.
- Stored in 1Password under two entries: "Buoy LLM Proxy — marieke-buoy" and "Buoy LLM Proxy — lachie-buoy".
- Materialised into the VPS filesystem at `/home/jod/buoy/.secrets/marieke_buoy_proxy_secret` and `/home/jod/buoy/.secrets/lachie_buoy_proxy_secret` at deploy time via the existing `secret-bootstrap` skill flow. (The Buoy `.secrets/` directory already holds `buoy_sync_secret`; these two new files sit alongside it.)
- Baked into Buoy's env at start (via systemd `EnvironmentFile=`). Each sibling reads its own secret at start the same way.
- Rotation: replace the affected entry in 1Password, redeploy Buoy plus the affected sibling. The other sibling is untouched.

## Model allow-list

Configured server-side in a new file `server/llm/proxy-models.ts`:

```ts
export const PROXY_ALLOWED_MODELS: Record<string, readonly string[]> = {
  perplexity: ["sonar", "sonar-pro", "sonar-reasoning-pro"],
};
```

The handler validates `req.body.model ∈ PROXY_ALLOWED_MODELS[currentProvider]`. Anything else → `400 invalid_model`. Keeps a misbehaving sibling from accidentally calling a deprecated or premium-tier model.

## Provider abstraction

Today there's one provider (Perplexity). v1 ships with one adapter. The pluggability hook is a single env var:

```
LLM_PROVIDER=perplexity   # default
```

In `server/llm/proxy.ts` (new file), a tiny resolver:

```ts
import type { LLMAdapter } from "./adapter";
import { getPerplexityAdapter } from "./perplexity";

export function getProxyAdapter(): LLMAdapter {
  const provider = (process.env.LLM_PROVIDER || "perplexity").toLowerCase();
  switch (provider) {
    case "perplexity":
      return getPerplexityAdapter();
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }
}
```

When you want OpenAI / Anthropic / Ollama, you add a new adapter (implements `LLMAdapter`), add a `case`, and extend `PROXY_ALLOWED_MODELS`. The sibling code is untouched.

## Rate limiting

Per-sibling caps, in-process, sliding window. Defaults:

- 60 requests per minute, **per sibling**.
- 600 requests per hour, **per sibling**.

A chatty sibling cannot starve a quieter one. The rate-limit map keys on `X-Sibling-Id`. Two siblings → two counter pairs (per-minute and per-hour) per sibling.

Implemented in `server/llm/proxy-rate-limit.ts` as a small in-memory sliding-window counter using monotonic timestamps.

When a cap fires: return `429 rate_limited`, include `Retry-After: <seconds>` header (time until the oldest request in the window falls out).

## Logging

Every `/api/llm/chat` call emits one structured log line:

```
[llm-proxy] caller=marieke-buoy model=sonar-pro in_tokens=312 out_tokens=488 ms=2104 status=200
```

- Always log: caller sibling ID, model, token counts, latency, HTTP status.
- For 401 responses (where there is no trusted sibling ID), log `caller=unknown ip=<x>` instead.
- Never log: the messages themselves, the response text, the API key, any proxy secret, the secret header value.
- Errors log a short reason (`upstream=503`, `invalid_model`, `rate_limited`) — still no message content.

## Caddy

The Caddy config on the VPS lives in a single `/etc/caddy/Caddyfile` (system-installed, not in this repo). It has three Buoy site blocks covering the four hostnames:

1. `anchor.thinhalo.com, buoy.thinhalo.com` (shared, uses `handle` directives)
2. `buoy-family.thinhalo.com` (bare `reverse_proxy`)
3. `oliver-availability.thinhalo.com` (bare `reverse_proxy`)

Each block needs an explicit deny for `/api/llm/*` so the proxy is unreachable from the public internet (defence in depth — the app already rejects non-loopback callers).

**For the shared anchor+buoy block** (which uses `handle`), add a `handle` for `/api/llm/*` **before** the existing `handle /port/5000/*` and default `handle`:

```caddy
anchor.thinhalo.com, buoy.thinhalo.com {
    encode gzip zstd

    # Stage 19 deny — proxy is loopback-only.
    handle /api/llm/* {
        respond 404
    }

    # ... existing /port/5000/* and default handle blocks unchanged ...
}
```

**For the two bare-`reverse_proxy` blocks** (`buoy-family`, `oliver-availability`), convert them to use matchers:

```caddy
buoy-family.thinhalo.com {
    @llm path /api/llm/*
    respond @llm 404
    reverse_proxy 127.0.0.1:5000
}

oliver-availability.thinhalo.com {
    @llm path /api/llm/*
    respond @llm 404
    reverse_proxy 127.0.0.1:5000
}
```

In Caddy, named matchers + a top-level `respond` short-circuit the request before `reverse_proxy` is reached. The two styles (handle-based vs matcher-based) achieve the same outcome; we use whichever fits the existing site block.

Future sibling hostnames (`marieke-buoy.thinhalo.com`, `lachie-buoy.thinhalo.com`) inherit the same pattern when their vhosts are added — they will be reverse-proxied to a separate loopback port (not 5000) and should not need to expose `/api/llm/*` either.

Belt-and-braces. The handler already rejects non-loopback, but Caddy returns 404 before the request even reaches Node — so curl from the open Internet can't even tell the endpoint exists.

This stage **does not modify Caddy configs from the agent sandbox** — they live on the VPS filesystem outside this repo. The change is included in the rollout checklist below for the operator to apply on the box.

## Files to add / change

New (in this repo):
- `server/llm/proxy.ts` — `getProxyAdapter()`, env-driven provider resolver.
- `server/llm/proxy-models.ts` — `PROXY_ALLOWED_MODELS` per-provider allow-list.
- `server/llm/proxy-rate-limit.ts` — in-memory sliding-window counter, keyed by sibling ID.
- `server/llm/sibling-registry.ts` — sibling ID → secret lookup, registry of known siblings.
- `server/llm-proxy-routes.ts` — `POST /api/llm/chat`, `GET /api/llm/health`, all three gates, logging, rate-limit hook.
- `test/stage19-llm-proxy.test.ts` — unit tests (see "Tests" below).
- `STAGE_19_SIBLING_LLM_PROXY_SPEC.md` — this doc.

Changed (in this repo):
- `server/routes.ts` — register the new route module.
- `HANDOFF.md` — new Stage 19 entry.

Ops changes (outside this repo, listed for the operator):
- `/etc/caddy/Caddyfile` — add the `/api/llm/*` deny to all three Buoy site blocks (covering all four hostnames). Reload with `sudo systemctl reload caddy`.
- Buoy systemd `EnvironmentFile=` — add `MARIEKE_BUOY_PROXY_SECRET=...`, `LACHIE_BUOY_PROXY_SECRET=...`, and (optionally) `LLM_PROVIDER=perplexity`.
- 1Password — entries `Buoy LLM Proxy — marieke-buoy` and `Buoy LLM Proxy — lachie-buoy` (vault `Computer`) already exist with the `secret` field populated. Seed `/home/jod/buoy/.secrets/marieke_buoy_proxy_secret` and `/home/jod/buoy/.secrets/lachie_buoy_proxy_secret` from those entries.

Unchanged:
- `server/llm/adapter.ts`, `server/llm/perplexity.ts` — reused as-is.
- `server/baked-llm-keys.ts` — unchanged; the proxy reads through the same adapter.
- Coach, scheduling-parser, coach-summary-backfill — keep their direct `getPerplexityAdapter()` calls.

## Tests (target ≥14 new)

1. Loopback IP matcher accepts `127.0.0.1`, `::1`, `::ffff:127.0.0.1`.
2. Loopback IP matcher rejects external-looking IPs (`203.0.113.5`, `8.8.8.8`).
3. Sibling registry returns the configured secret for known IDs.
4. Sibling registry returns null for an unknown ID.
5. Sibling registry returns null when the env var for a registered ID is unset.
6. Auth check: missing `X-Sibling-Auth` → fails.
7. Auth check: empty `X-Sibling-Auth` → fails (even though both sides could be empty strings, fail closed).
8. Auth check: wrong value of the right length → fails (constant-time path exercised).
9. Auth check: correct value → passes.
10. Model allow-list rejects unknown model.
11. Model allow-list accepts each documented model.
12. Body validation rejects empty messages, missing model, maxTokens > 4000, temperature out of `[0, 1]`.
13. Rate limiter: 60 in a minute pass, 61st fails with `Retry-After` > 0.
14. Rate limiter: per-sibling isolation — `marieke-buoy` hitting its cap does not affect `lachie-buoy`.
15. Rate limiter: hour cap fires independently of minute cap.
16. Provider resolver: `LLM_PROVIDER=perplexity` resolves; `LLM_PROVIDER=fake` throws.
17. Route registration: `server/routes.ts` registers the new module.
18. Source-text guard: routes module never logs message content or secrets.

## Sibling-side integration (informational, not part of this stage)

Each sibling reads its own proxy secret from its own `.secrets/<sibling-id>_proxy_secret` file and posts to `http://127.0.0.1:5000/api/llm/chat` with these headers:

```
X-Sibling-Id: marieke-buoy            # or lachie-buoy
X-Sibling-Auth: <secret>
Content-Type: application/json
```

A tiny client (~40 lines) wraps that. Each sibling repo gets its own commit; this Stage 19 only ships the Buoy side.

## Acceptance criteria

- From the VPS itself, with the env var seeded:
  ```
  curl -sS \
    -H "X-Sibling-Id: marieke-buoy" \
    -H "X-Sibling-Auth: $(cat /home/jod/buoy/.secrets/marieke_buoy_proxy_secret)" \
    -H 'Content-Type: application/json' \
    -d '{"model":"sonar-pro","messages":[{"role":"user","content":"hi"}]}' \
    http://127.0.0.1:5000/api/llm/chat
  ```
  returns 200 with a `text` field. Same with `lachie-buoy`.
- The same curl from a laptop targeting `https://buoy.thinhalo.com/api/llm/chat` returns 404 (Caddy block) — and would return 401 even if it got past Caddy.
- `GET http://127.0.0.1:5000/api/llm/health` returns `{ available: true, provider: "perplexity", models: [...] }`.
- Logs show one `[llm-proxy]` line per request with no message content, with the sibling ID as `caller=`.
- All existing 466 tests still pass; new ≥14 tests pass.

## Out-of-scope but worth noting

- **Streaming.** When a sibling wants streaming, add `POST /api/llm/chat/stream` that pipes the adapter's `TokenStream` straight through as SSE. Same gates and rate limit, slightly more careful error handling. Defer.
- **Cost dashboards.** The structured log lines already carry token counts; a small parser into Buoy's existing usage table is a small later stage. Defer.
- **Sibling Caddy vhosts and DNS** (Option A): not in scope. Each sibling's deploy stage adds its own.
- **Third-party LLM providers.** v1 ships with Perplexity only. The `LLM_PROVIDER` env var hook is wired and tested but no other adapters are added.

## Rollout

1. Land this stage in one commit on `main` (same shape as Stage 18: spec + code + tests, all together).
2. **Operator step** — on the VPS:
   1. Create two 1Password entries ("Buoy LLM Proxy — marieke-buoy" / "… lachie-buoy") with 64-char random base64 secrets.
   2. Materialise into `/home/jod/buoy/.secrets/marieke_buoy_proxy_secret` and `/home/jod/buoy/.secrets/lachie_buoy_proxy_secret` (0600, owned by jod). These sit alongside the existing `/home/jod/buoy/.secrets/buoy_sync_secret`.
   3. Update Buoy's systemd `EnvironmentFile` (or service unit) to load:
      - `MARIEKE_BUOY_PROXY_SECRET=$(cat /home/jod/buoy/.secrets/marieke_buoy_proxy_secret)`
      - `LACHIE_BUOY_PROXY_SECRET=$(cat /home/jod/buoy/.secrets/lachie_buoy_proxy_secret)`
      - `LLM_PROVIDER=perplexity` (optional; this is the default)
   4. Add the `/api/llm/*` deny block to each of the three Buoy site blocks in `/etc/caddy/Caddyfile` (see "Caddy" section for exact snippets).
   5. `sudo caddy validate --config /etc/caddy/Caddyfile` before reload.
3. Reload services: `sudo systemctl reload caddy`, then `sudo -u jod /opt/buoy/ops/deploy.sh`.
4. Smoke-test with the curl commands in "Acceptance criteria" above.
5. Only then start work on each sibling service — first feature on each sibling is "hit the proxy and print the response".

## Sign-off (2026-05-16 AEST)

1. **Provider in v1:** Perplexity Sonar only — confirmed.
2. **Default model:** `sonar-pro` — confirmed.
3. **Rate-limit caps:** 60/min and 600/hour, **per sibling** — confirmed.
4. **Caddy:** deny `/api/llm/*` on all public hostnames — confirmed.
5. **Secret naming:** per-sibling, tied to the sibling's name (`MARIEKE_BUOY_PROXY_SECRET` / `LACHIE_BUOY_PROXY_SECRET`) — confirmed.
6. **Scope:** Option A — Buoy-side proxy only. No sibling Caddy vhosts, no sibling DNS, no sibling code. — confirmed.
7. **Caller identification:** `X-Sibling-Id` header required, values `marieke-buoy` / `lachie-buoy` — confirmed.
