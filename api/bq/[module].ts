/* ============================================================
   /api/bq/[module] — serve dashboard modules from the per-client
   BigQuery marts with REAL date-range SQL and real previous-window
   deltas. No scaling factors.

   Thin transport only: every module's SQL lives in lib/bq-modules.mjs,
   shared verbatim with scripts/dev-api.mjs (the emulator server), so
   local and production can never drift.

   Server-side only: GCP_PROJECT + GCP_SA_KEY (base64 SA JSON).
   Tenant isolation (ISO 27001): dataset per client, resolved from the
   CLIENT_DATASETS allowlist — never interpolated from raw input.
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";
// @ts-ignore — plain ESM module shared with the local dev server
import { MODULES, CLIENT_DATASETS, windowFor } from "../../lib/bq-modules.mjs";

let _bq: BigQuery | null = null;
function client(): BigQuery | null {
  if (_bq) return _bq;
  const projectId = process.env.GCP_PROJECT;
  const b64 = process.env.GCP_SA_KEY;
  if (!projectId || !b64) return null;
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  _bq = new BigQuery({ projectId, credentials });
  return _bq;
}

export default async function handler(req: any, res: any) {
  const moduleKey = String(req.query.module || "").replace(/[^a-zA-Z0-9]/g, "");
  const clientSlug = String(req.query.client || "");
  const rangeKey = String(req.query.range || "30d").replace(/[^a-z0-9]/g, "") || "30d";
  const dataset = (CLIENT_DATASETS as Record<string, string>)[clientSlug]; // allowlist gate
  if (!moduleKey) { res.status(400).json({ error: "missing module" }); return; }
  if (!dataset) { res.status(403).json({ error: "unknown client" }); return; }
  const mod = (MODULES as Record<string, any>)[moduleKey];
  if (!mod) { res.status(404).json({ error: "module not mapped to a mart yet" }); return; }
  const bq = client();
  if (!bq) { res.status(503).json({ error: "BigQuery not configured (GCP_PROJECT / GCP_SA_KEY)" }); return; }
  try {
    const w = windowFor(rangeKey);
    const body = await mod(bq, dataset, w);
    res.status(200).json({ module: moduleKey, client: clientSlug, source: "bq-mart", real_window: true, window: w, ...body });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "bq query failed" });
  }
}
