// Stage 19 (2026-05-16) — LLM proxy provider resolver.
//
// One env var (`LLM_PROVIDER`) selects which underlying adapter the proxy
// dispatches to. v1 only wires Perplexity. Adding a second provider later is
// a new adapter file plus one `case` here.
//
// Kept deliberately tiny so swapping providers is a small, auditable change.

import type { LLMAdapter } from "./adapter";
import { getPerplexityAdapter } from "./perplexity";

export const DEFAULT_PROVIDER = "perplexity";

export function currentProvider(): string {
  return (process.env.LLM_PROVIDER || DEFAULT_PROVIDER).toLowerCase();
}

/**
 * Resolve the configured provider to its `LLMAdapter`. Throws for an
 * unknown provider so a misconfigured deploy fails loud at boot rather
 * than silently routing through the default.
 */
export function getProxyAdapter(): LLMAdapter {
  const provider = currentProvider();
  switch (provider) {
    case "perplexity":
      return getPerplexityAdapter();
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }
}
