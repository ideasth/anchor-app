import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Exposed so streaming endpoints (e.g. /api/coach/sessions/:id/turn) can
// build full URLs with auth-query the same way apiRequest does.
export function buildApiUrl(path: string): string {
  return `${API_BASE}${withAuthQuery(path)}`;
}

export function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  return buildHeaders(extra);
}
const TOKEN_KEY = "buoy_token";

// Stage 14 phase 2 (2026-05-12): one-time migration from the legacy
// "anchor_token" localStorage key to "buoy_token". Runs at module load.
// Idempotent: only copies when the legacy key exists and the new key
// hasn't been populated yet. The legacy key is intentionally left in
// place for one release in case a user reverts to a pre-rename build.
try {
  if (typeof localStorage !== "undefined") {
    const legacyToken = localStorage.getItem("anchor_token");
    const currentToken = localStorage.getItem("buoy_token");
    if (legacyToken && !currentToken) {
      localStorage.setItem("buoy_token", legacyToken);
    }
    // Do NOT remove the legacy key — leaving it for one release in case a user reverts.
  }
} catch {
  /* localStorage unavailable (SSR or disabled) — no-op */
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getStoredToken();
  if (token) {
    // X-Buoy-Token (legacy X-Anchor-Token still accepted by server).
    headers["X-Buoy-Token"] = token;
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// Append ?t=<token> to API URLs. Required to authenticate through the
// deploy_website proxy, which strips Cookie / Authorization / X-Buoy-Token
// (legacy X-Anchor-Token still accepted by server).
// Public/auth endpoints (status, login, setup) don't need it but accepting
// the param does no harm so we always append when a token is present.
function withAuthQuery(url: string): string {
  const token = getStoredToken();
  if (!token) return url;
  // Don't double-add
  if (/[?&]t=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${encodeURIComponent(token)}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function handleAuthFailure(res: Response) {
  if (res.status === 401) {
    // Token invalid/expired — clear so Login.tsx re-prompts.
    setStoredToken(null);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = buildHeaders(data ? { "Content-Type": "application/json" } : undefined);
  const res = await fetch(`${API_BASE}${withAuthQuery(url)}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "omit",
  });

  if (!res.ok) handleAuthFailure(res);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${withAuthQuery(queryKey.join("/"))}`, {
      credentials: "omit",
      headers: buildHeaders(),
    });

    if (res.status === 401) {
      handleAuthFailure(res);
      if (unauthorizedBehavior === "returnNull") return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
