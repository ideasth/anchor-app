// Stage 19 (2026-05-16) — Sibling LLM proxy routes.
//
// Mounts:
//   POST /api/llm/chat    — non-streaming chat completion
//   GET  /api/llm/health  — liveness probe for siblings
//
// All requests must pass three gates:
//   1. Loopback only (127.0.0.1 / ::1 / ::ffff:127.0.0.1).
//   2. Known sibling ID via X-Sibling-Id header.
//   3. Matching shared secret via X-Sibling-Auth (constant-time compare).
//
// `/chat` additionally validates the request body against a model
// allow-list, hard caps maxTokens, and applies a per-sibling sliding-
// window rate limit. Logs one structured line per request.

import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { getProxyAdapter, currentProvider } from "./llm/proxy";
import {
  PROXY_ALLOWED_MODELS,
  PROXY_DEFAULT_MODEL,
  isAllowedModel,
} from "./llm/proxy-models";
import { proxyRateLimiter } from "./llm/proxy-rate-limit";
import {
  getSiblingSecret,
  isKnownSiblingId,
} from "./llm/sibling-registry";
import type { CoachMessage } from "./llm/adapter";

// ---------- Loopback gate ----------

const LOOPBACK_IPS = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

export function isLoopbackIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  return LOOPBACK_IPS.has(ip);
}

// ---------- Constant-time secret check ----------

/**
 * Compare two strings in constant time over the longer of the two. Returns
 * false if either is empty (fail closed) — we never accept an empty secret
 * even if the server side is also empty (which it shouldn't be).
 */
export function secretsMatch(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  // Pad to the same length so timingSafeEqual doesn't early-return on the
  // length check, then compare. Mismatched lengths are guaranteed to fail.
  const len = Math.max(expected.length, supplied.length);
  const a = Buffer.alloc(len);
  const b = Buffer.alloc(len);
  a.write(expected);
  b.write(supplied);
  // timingSafeEqual still leaks length, which is fine — secret lengths are
  // a property of our deployment, not user input.
  const eq = timingSafeEqual(a, b);
  return eq && expected.length === supplied.length;
}

// ---------- Body validation ----------

interface ChatBody {
  model?: unknown;
  messages?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  disableSearch?: unknown;
}

interface ValidatedChat {
  model: string;
  messages: CoachMessage[];
  temperature: number;
  maxTokens: number;
  disableSearch: boolean;
}

export const MAX_TOKENS_HARD_CAP = 4000;

export function validateChatBody(
  body: ChatBody,
  provider: string,
): { ok: true; value: ValidatedChat } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_request" };
  }

  // Messages: required, non-empty, each {role, content} with content string.
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "invalid_request" };
  }
  const cleanMessages: CoachMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return { ok: false, error: "invalid_request" };
    const role = (m as any).role;
    const content = (m as any).content;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      return { ok: false, error: "invalid_request" };
    }
    if (typeof content !== "string" || content.length === 0) {
      return { ok: false, error: "invalid_request" };
    }
    cleanMessages.push({ role, content });
  }

  // Model: optional in the request; defaults to PROXY_DEFAULT_MODEL.
  const requestedModel =
    typeof body.model === "string" && body.model.length > 0
      ? body.model
      : PROXY_DEFAULT_MODEL[provider];
  if (!requestedModel) {
    // No default configured for this provider.
    return { ok: false, error: "invalid_model" };
  }
  if (!isAllowedModel(provider, requestedModel)) {
    return { ok: false, error: "invalid_model" };
  }

  // Temperature: optional, [0, 1].
  let temperature = 0.4;
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== "number" || Number.isNaN(body.temperature)) {
      return { ok: false, error: "invalid_request" };
    }
    if (body.temperature < 0 || body.temperature > 1) {
      return { ok: false, error: "invalid_request" };
    }
    temperature = body.temperature;
  }

  // maxTokens: optional, 1..MAX_TOKENS_HARD_CAP.
  let maxTokens = 1200;
  if (body.maxTokens !== undefined) {
    if (
      typeof body.maxTokens !== "number" ||
      !Number.isInteger(body.maxTokens) ||
      body.maxTokens < 1 ||
      body.maxTokens > MAX_TOKENS_HARD_CAP
    ) {
      return { ok: false, error: "invalid_request" };
    }
    maxTokens = body.maxTokens;
  }

  // disableSearch: optional boolean, defaults to true for the proxy.
  let disableSearch = true;
  if (body.disableSearch !== undefined) {
    if (typeof body.disableSearch !== "boolean") {
      return { ok: false, error: "invalid_request" };
    }
    disableSearch = body.disableSearch;
  }

  return {
    ok: true,
    value: {
      model: requestedModel,
      messages: cleanMessages,
      temperature,
      maxTokens,
      disableSearch,
    },
  };
}

// ---------- Logging ----------

function logLine(parts: Record<string, string | number | undefined>): void {
  const fields = Object.entries(parts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.log(`[llm-proxy] ${fields}`);
}

// ---------- Route registration ----------

export function registerLLMProxyRoutes(app: Express): void {
  // ---- POST /api/llm/chat ----
  app.post("/api/llm/chat", async (req: Request, res: Response) => {
    const started = Date.now();

    // Gate 1 — loopback.
    if (!isLoopbackIp(req.ip)) {
      logLine({ caller: "unknown", ip: req.ip ?? "?", status: 401, reason: "non_loopback" });
      return res.status(401).json({ error: "forbidden" });
    }

    // Gate 2 — known sibling ID.
    const rawId = req.header("x-sibling-id");
    const siblingId = typeof rawId === "string" ? rawId : "";
    if (!isKnownSiblingId(siblingId)) {
      logLine({ caller: "unknown", ip: req.ip ?? "?", status: 401, reason: "unknown_sibling" });
      return res.status(401).json({ error: "forbidden" });
    }

    // Gate 3 — secret match.
    const expected = getSiblingSecret(siblingId);
    const supplied = req.header("x-sibling-auth") ?? "";
    if (!expected || !secretsMatch(expected, supplied)) {
      logLine({ caller: siblingId, status: 401, reason: "bad_secret" });
      return res.status(401).json({ error: "forbidden" });
    }

    // Adapter availability — fail fast if no key.
    const adapter = getProxyAdapter();
    if (!adapter.isAvailable()) {
      logLine({ caller: siblingId, status: 503, reason: "no_key" });
      return res.status(503).json({ error: "provider_unavailable" });
    }

    // Body validation.
    const provider = currentProvider();
    const parsed = validateChatBody((req.body ?? {}) as ChatBody, provider);
    if (!parsed.ok) {
      logLine({ caller: siblingId, status: 400, reason: parsed.error });
      return res.status(400).json({ error: parsed.error });
    }
    const { model, messages, temperature, maxTokens, disableSearch } = parsed.value;

    // Rate limit (after auth, so anonymous probes can't drain the bucket).
    const decision = proxyRateLimiter.check(siblingId);
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfter));
      logLine({
        caller: siblingId,
        status: 429,
        reason: `rate_limited_${decision.reason}`,
        retry_after: decision.retryAfter,
      });
      return res.status(429).json({ error: "rate_limited" });
    }

    // Dispatch.
    try {
      const result = await adapter.complete({
        model,
        messages,
        temperature,
        maxTokens,
        disableSearch,
      });
      const ms = Date.now() - started;
      logLine({
        caller: siblingId,
        model,
        in_tokens: result.usage.inputTokens,
        out_tokens: result.usage.outputTokens,
        ms,
        status: 200,
      });
      return res.json({
        text: result.fullText,
        model: result.modelUsed,
        usage: result.usage,
        citations: result.citations ?? [],
      });
    } catch (err) {
      const ms = Date.now() - started;
      const msg = err instanceof Error ? err.message : String(err);
      // Map upstream HTTP errors to 502; everything else to 500. The
      // Perplexity adapter throws Error with the upstream status in the
      // message ("Perplexity HTTP 503: ...").
      const upstream = /HTTP\s+(\d{3})/i.exec(msg);
      const status = upstream ? 502 : 500;
      logLine({
        caller: siblingId,
        model,
        ms,
        status,
        reason: upstream ? `upstream=${upstream[1]}` : "upstream_error",
      });
      return res.status(status).json({
        error: upstream ? "provider_error" : "internal_error",
        upstream_status: upstream ? Number(upstream[1]) : undefined,
      });
    }
  });

  // ---- GET /api/llm/health ----
  app.get("/api/llm/health", (req: Request, res: Response) => {
    if (!isLoopbackIp(req.ip)) {
      return res.status(401).json({ error: "forbidden" });
    }
    const provider = currentProvider();
    let available = false;
    try {
      available = getProxyAdapter().isAvailable();
    } catch {
      available = false;
    }
    return res.json({
      available,
      provider,
      models: PROXY_ALLOWED_MODELS[provider] ?? [],
    });
  });
}
