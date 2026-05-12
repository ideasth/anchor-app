// Stage 17 — Availability SPA entry point.
// Served from oliver-availability.thinhalo.com.

import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../src/lib/queryClient";
import AvailabilityApp from "./AvailabilityApp";
import "../src/index.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AvailabilityApp />
  </QueryClientProvider>,
);
