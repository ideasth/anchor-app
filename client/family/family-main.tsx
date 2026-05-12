// Stage 17 — Family SPA entry point.
// Served from buoy-family.thinhalo.com.

import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../src/lib/queryClient";
import FamilyApp from "./FamilyApp";
import "../src/index.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <FamilyApp />
  </QueryClientProvider>,
);
