// Stage 14 (2026-05-12) — shared helpers for the sync-secret rename
// transition. Kept standalone so unit tests can pin the both-headers
// and both-env-vars behaviour without booting routes.ts.

/**
 * Read the sync secret from the environment, preferring the new
 * BUOY_SYNC_SECRET over the legacy ANCHOR_SYNC_SECRET, falling back to
 * an optional baked value (used when no env injection is available).
 */
export function resolveSyncSecret(
  env: NodeJS.ProcessEnv,
  baked: string,
): string {
  return env.BUOY_SYNC_SECRET || env.ANCHOR_SYNC_SECRET || baked || "";
}

/**
 * Pick whichever sync-secret header the caller provided. Headers
 * arrive lowercased on req.headers in Express. Returns "" when
 * neither is set.
 */
export function readSyncSecretHeader(
  headers: Record<string, string | string[] | undefined>,
): string {
  const pick = (key: string): string => {
    const v = headers[key];
    if (Array.isArray(v)) return (v[0] ?? "").trim();
    return (v ?? "").trim();
  };
  const buoy = pick("x-buoy-sync-secret");
  if (buoy) return buoy;
  return pick("x-anchor-sync-secret");
}
