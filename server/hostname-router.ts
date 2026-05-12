// Stage 17 — hostname-based routing.
// classifyHost() is the single source of truth for deciding which surface
// a request belongs to.  All callers (host-guard middleware, static-file
// middleware, tests) import from here.

export type HostKind = "apex" | "family" | "availability";

export function classifyHost(host: string | undefined): HostKind | null {
  if (!host) return null;
  const h = host.toLowerCase().split(":")[0];
  if (h === "buoy.thinhalo.com" || h === "anchor.thinhalo.com") return "apex";
  if (h === "buoy-family.thinhalo.com") return "family";
  if (h === "oliver-availability.thinhalo.com") return "availability";
  // localhost / 127.0.0.1 / *.pplx.app — treat as apex for dev convenience.
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".pplx.app")) return "apex";
  return null;
}
