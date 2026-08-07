import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Local dev: /api/bq/* → scripts/dev-api.mjs (:8790) → BigQuery emulator marts.
    proxy: { "/api": "http://localhost:8790" },
  },
});
