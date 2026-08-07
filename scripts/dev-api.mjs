/* ============================================================
   dev-api.mjs — local /api/bq server backed by the BigQuery emulator.
   Thin transport: all module SQL lives in lib/bq-modules.mjs, shared
   verbatim with the Vercel function, so local and prod can't drift.

   Run:  npm run dev:api        (vite proxies /api → :8790)
   ============================================================ */
import http from "node:http";
import { BigQuery } from "@google-cloud/bigquery";
import { MODULES, CLIENT_DATASETS, windowFor } from "../lib/bq-modules.mjs";

const PORT = 8790;
const bq = new BigQuery({ projectId: "entangle-local", apiEndpoint: "http://localhost:9050" });

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const m = u.pathname.match(/^\/api\/bq\/([a-zA-Z0-9]+)$/);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (!m) return send(404, { error: "not found" });
  const clientSlug = u.searchParams.get("client") || "";
  const ds = CLIENT_DATASETS[clientSlug];
  if (!ds) return send(403, { error: "unknown client" });
  const handler = MODULES[m[1]];
  if (!handler) return send(404, { error: "module not mapped to a mart yet" });
  try {
    const w = windowFor(u.searchParams.get("range") || "30d");
    send(200, { module: m[1], client: clientSlug, source: "emulator-mart", real_window: true, window: w, ...(await handler(bq, ds, w)) });
  } catch (e) { send(500, { error: e.message }); }
}).listen(PORT, () => console.log(`dev-api on http://localhost:${PORT} → emulator marts (${Object.keys(MODULES).join(", ")})`));
