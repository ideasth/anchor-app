// Stage 19 (2026-05-16) — Sibling registry for the LLM proxy.
//
// Maps a public sibling ID (the X-Sibling-Id header value the sibling sends
// on every request) to the environment variable name that carries that
// sibling's shared secret.
//
// Adding a new sibling is a one-line change: append to REGISTRY, ship a new
// 1Password entry, set the env var on the VPS. No other code changes
// required.

export type SiblingId = "marieke-buoy" | "lachie-buoy";

interface SiblingEntry {
  id: SiblingId;
  envVar: string;
}

/**
 * The canonical list of sibling IDs the proxy will speak to. Anything not in
 * this list is rejected with 401 at the door.
 */
export const REGISTRY: readonly SiblingEntry[] = [
  { id: "marieke-buoy", envVar: "MARIEKE_BUOY_PROXY_SECRET" },
  { id: "lachie-buoy", envVar: "LACHIE_BUOY_PROXY_SECRET" },
] as const;

const REGISTRY_BY_ID: ReadonlyMap<string, SiblingEntry> = new Map(
  REGISTRY.map((e) => [e.id, e] as const),
);

/**
 * Returns the configured secret for the given sibling ID, or null if the
 * sibling is unknown OR the env var is unset/blank. Callers must treat
 * null as "this sibling cannot authenticate" — fail closed.
 *
 * Reading the env var lazily on each lookup (rather than caching at module
 * load) makes the registry trivially testable: a test can write to
 * `process.env.MARIEKE_BUOY_PROXY_SECRET` before each assertion.
 */
export function getSiblingSecret(id: string): string | null {
  const entry = REGISTRY_BY_ID.get(id);
  if (!entry) return null;
  const value = process.env[entry.envVar];
  if (!value || value.length === 0) return null;
  return value;
}

/**
 * True iff the given string is a known sibling ID. Cheap discriminator
 * used by route handlers before they read the secret.
 */
export function isKnownSiblingId(id: string): id is SiblingId {
  return REGISTRY_BY_ID.has(id);
}

/**
 * The set of registered sibling IDs, for diagnostics and tests.
 */
export function listSiblingIds(): readonly SiblingId[] {
  return REGISTRY.map((e) => e.id);
}
