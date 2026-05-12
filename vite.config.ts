import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Stage 17: multi-entry build for apex + family + availability SPAs.
    rollupOptions: {
      // Stage 17: three entry points.
      // family/index.html  → dist/public/family/index.html
      // availability/index.html → dist/public/availability/index.html
      // index.html → dist/public/index.html (apex)
      input: {
        main: path.resolve(import.meta.dirname, "client", "index.html"),
        family: path.resolve(import.meta.dirname, "client", "family", "index.html"),
        availability: path.resolve(import.meta.dirname, "client", "availability", "index.html"),
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
