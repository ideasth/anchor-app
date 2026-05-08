// In-memory ring buffer of recent server errors. Survives until the sandbox
// restarts (which is fine — the published sandbox is ephemeral and the local
// dev sandbox restarts on `npm run dev`). This is the H-lite alternative to
// Sentry: zero external dependencies, single-user trust surface, exposed at
// /api/admin/recent-errors with sync-secret auth.\n//
// The buffer holds the last N errors. Each entry includes:
//  - createdAt: unix milliseconds when the error was recorded
//  - statusCode: HTTP status the response will/did emit (or null for non-HTTP)
//  - method, path: request context, redacted of querystring
//  - message: error message (truncated to 500 chars)
//  - stack: top frames of the stack (truncated to ~2000 chars)
//
// We deliberately do NOT log request bodies, headers, or query strings —
// those are the most common vectors for accidentally surfacing the sync
// secret or PHI. Stacks can include filenames; that is fine.

const RING_SIZE = 100;

export interface RecentError {
  createdAt: number;
  statusCode: number | null;
  method: string | null;
  path: string | null;
  message: string;
  stack: string | null;
}

const buffer: RecentError[] = [];

function clip(s: unknown, max: number): string {
  if (s == null) return "";
  const str = typeof s === "string" ? s : String(s);
  return str.length > max ? str.slice(0, max) + "…[truncated]" : str;
}

export function recordError(input: {
  err: unknown;
  statusCode?: number | null;
  method?: string | null;
  path?: string | null;
}): void {
  const errObj = input.err as { message?: unknown; stack?: unknown } | null | undefined;
  const message = clip(errObj?.message ?? input.err, 500);
  const stack = errObj?.stack ? clip(errObj.stack, 2000) : null;
  const entry: RecentError = {
    createdAt: Date.now(),
    statusCode: input.statusCode ?? null,
    method: input.method ?? null,
    // strip querystring — body params should never be in the path either
    path: input.path ? input.path.split("?")[0] : null,
    message,
    stack,
  };
  buffer.push(entry);
  if (buffer.length > RING_SIZE) buffer.shift();
}

export function listErrors(limit?: number): RecentError[] {
  const n = typeof limit === "number" && limit > 0 && limit <= RING_SIZE ? limit : RING_SIZE;
  // Most-recent first.
  return buffer.slice(-n).reverse();
}

export function clearErrors(): number {
  const n = buffer.length;
  buffer.length = 0;
  return n;
}

export function ringSize(): number {
  return RING_SIZE;
}
