/* ============================================================
   /api/bq/[module] — read demo (or live) marts from BigQuery.
   Server-side only: the service-account key never reaches the browser.
   Auth via env: GCP_PROJECT + GCP_SA_KEY (base64-encoded SA JSON).

   Tenant isolation (ISO 27001): each client's data lives in its own
   dataset demo_client_<slug>. The dataset is resolved from an ALLOWLIST
   keyed by the (authenticated) client slug — never interpolated from raw
   input — which closes the identifier-injection gap.

   Returns { module, client, kpis:[...], paths?:[...] } shaped for
   provider.ts to overlay onto the module's data.
   Runs as a Vercel Node serverless function.
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";

// Allowlist: authenticated client slug -> its isolated dataset.
// Extend this as clients are provisioned (or load from a config/secret).
const CLIENT_DATASETS: Record<string, string> = {
  "aqua-pulse-spas": "demo_client_aqua_pulse_spas",
  "care-for-you-at-home": "demo_client_care_for_you_at_home",
  "ms-plus": "demo_client_ms_plus",
};

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

// BigQuery stores KPI value as STRING; coerce numerics back to numbers.
function coerce(v: any): number | string {
  if (v == null) return "";
  const n = Number(v);
  return String(v).trim() !== "" && !Number.isNaN(n) ? n : String(v);
}

export default async function handler(req: any, res: any) {
  const moduleKey = String(req.query.module || "").replace(/[^a-zA-Z0-9]/g, "");
  const clientSlug = String(req.query.client || "");
  const rangeKey = String(req.query.range || "30d").replace(/[^a-z0-9]/g, "") || "30d";
  const dataset = CLIENT_DATASETS[clientSlug]; // allowlist gate — no raw identifier in SQL
  if (!moduleKey) { res.status(400).json({ error: "missing module" }); return; }
  if (!dataset) { res.status(403).json({ error: "unknown client" }); return; }

  const bq = client();
  if (!bq) { res.status(503).json({ error: "BigQuery not configured (GCP_PROJECT / GCP_SA_KEY)" }); return; }

  try {
    const [kpiRows] = await bq.query({
      query:
        "SELECT label AS l, value AS v, fmt, delta AS d, dir, good, rate, hero " +
        "FROM `" + dataset + ".marts_kpis` " +
        "WHERE module = @module AND range_key = @range AND is_demo = TRUE ORDER BY ord",
      params: { module: moduleKey, range: rangeKey },
    });
    if (!kpiRows.length) { res.status(404).json({ error: "no rows for module", module: moduleKey }); return; }

    const kpis = kpiRows.map((r: any) => ({
      l: r.l, v: coerce(r.v), fmt: r.fmt || undefined, d: r.d ?? undefined,
      dir: r.dir || undefined, good: r.good || undefined, rate: !!r.rate, hero: !!r.hero,
    }));
    const out: any = { module: moduleKey, client: clientSlug, kpis };

    if (moduleKey === "attribution") {
      const [pathRows] = await bq.query({
        query: "SELECT path, conv, rev FROM `" + dataset + ".marts_attribution_paths` WHERE range_key = @range AND is_demo = TRUE ORDER BY ord",
        params: { range: rangeKey },
      });
      out.paths = pathRows.map((r: any) => ({ path: r.path, conv: Number(r.conv), rev: Number(r.rev) }));
    }
    res.status(200).json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "bq query failed" });
  }
}
