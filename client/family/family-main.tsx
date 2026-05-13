// Stage 17b — Family SPA entry point.
// Served from buoy-family.thinhalo.com.
//
// The family bundle now renders the same CalendarPlanner used on apex,
// giving Marieke and the kids the full year-grouped calendar view with
// notes, drawers, and find-time. Auth is family-token only (cookie set
// by requireFamilyAuth on the first /?t=<TOKEN> hit).
//
// We piggy-back on the apex queryClient (which appends ?t=<localStorage
// token> to every fetch) by stashing the family token into the same
// localStorage key the apex client uses. requireFamilyAuth accepts the
// same token either via cookie OR ?t= query, so apex's apiRequest works
// unchanged once the token is in storage.

import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, setStoredToken, getStoredToken } from "../src/lib/queryClient";
import CalendarPlanner from "../src/pages/CalendarPlanner";
import "../src/index.css";

// Stage 17b: capture token from URL on first load, persist for subsequent
// API calls. We strip the token from the URL bar afterwards so a copy/paste
// of the address doesn't leak the credential (cookie remains).
function bootstrapFamilyToken() {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("t");
    if (t) {
      setStoredToken(t);
      url.searchParams.delete("t");
      const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
      window.history.replaceState({}, "", cleaned);
    } else if (!getStoredToken()) {
      // No token in URL and none stored — the server will already have
      // 401'd before we even loaded, but show a clear hint just in case.
      const root = document.getElementById("root");
      if (root) {
        root.innerHTML =
          '<div style="font-family: system-ui; padding: 2rem; max-width: 32rem; margin: 4rem auto; color: #0d2a4a;">' +
          "<h1>Family calendar</h1>" +
          "<p>This page needs the family token to load. Use the URL Oliver shared with you " +
          "(it ends with <code>?t=...</code>).</p>" +
          "</div>";
      }
      throw new Error("no family token");
    }
  } catch (err) {
    // bootstrap errors fall through; the SPA render below will retry fetch
    // and surface API errors as normal.
    // eslint-disable-next-line no-console
    console.warn("family bootstrap:", err);
  }
}

bootstrapFamilyToken();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <CalendarPlanner />
  </QueryClientProvider>,
);
