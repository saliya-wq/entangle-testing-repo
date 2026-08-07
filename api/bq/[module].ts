/* ============================================================
   /api/bq/[module] — serve dashboard modules from the per-client
   BigQuery marts (client_<slug>.fact_ads_campaign_daily) with REAL
   date-range SQL and real previous-window deltas. No scaling factors.

   Server-side only: GCP_PROJECT + GCP_SA_KEY (base64 SA JSON) env.
   Tenant isolation (ISO 27001): dataset per client, resolved via the
   ALLOWLIST below — never interpolated from raw input.

   Mirrors scripts/dev-api.mjs (which serves the same contract from the
   local emulator). DATA_END anchors the dummy window; remove once the
   real DTS transfer supplies fresh dates.
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";

const DATA_END = "2026-08-06"; // dummy-data anchor — drop when DTS is linked

const CLIENT_DATASETS: Record<string, string> = {
  "aqua-pulse-spas": "client_aqua_pulse_spas",
  "care-for-you-at-home": "client_care_for_you_at_home",
  "ms-plus": "client_ms_plus",
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

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (s: string, days: number) => iso(new Date(new Date(s + "T00:00:00Z").getTime() + days * 86400000));
function windowFor(rangeKey: string) {
  const end = DATA_END;
  const days = ({ "7d": 7, "30d": 30, qtd: 37, ytd: 90 } as Record<string, number>)[rangeKey] ?? 30;
  const start = rangeKey === "qtd" ? "2026-07-01" : shift(end, -(days - 1));
  return { start, end, prevStart: shift(start, -days), prevEnd: shift(start, -1) };
}
const div = (a: number, b: number) => (b ? a / b : 0);
function kpi(l: string, v: number, fmt: string, o: any = {}) {
  const k: any = { l, v, fmt, ...o };
  if (o.prior != null && o.prior !== 0) {
    const d = ((v - o.prior) / o.prior) * 100;
    k.d = Math.abs(Math.round(d * 10) / 10);
    k.dir = d >= 0 ? "up" : "down";
  }
  delete k.prior;
  return k;
}

async function agg(bq: BigQuery, ds: string, start: string, end: string) {
  const [rows] = await bq.query({
    query:
      "SELECT SUM(cost_micros)/1e6 AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks, " +
      "SUM(conversions) AS conversions, SUM(conversions_value) AS conv_value " +
      "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e",
    params: { s: start, e: end },
  });
  const r: any = rows[0] || {};
  return {
    spend: Number(r.spend || 0), impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
    conversions: Number(r.conversions || 0), convValue: Number(r.conv_value || 0),
  };
}

async function googleAds(bq: BigQuery, ds: string, w: ReturnType<typeof windowFor>) {
  const [cur, prev] = await Promise.all([agg(bq, ds, w.start, w.end), agg(bq, ds, w.prevStart, w.prevEnd)]);
  const [campRows] = await bq.query({
    query:
      "SELECT campaign_name, ANY_VALUE(campaign_status) AS status, SUM(cost_micros)/1e6 AS cost, SUM(clicks) AS clicks, " +
      "SUM(impressions) AS impressions, SUM(conversions) AS conv, SUM(conversions_value) AS value " +
      "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY campaign_name ORDER BY cost DESC",
    params: { s: w.start, e: w.end },
  });
  const [devRows] = await bq.query({
    query: "SELECT device, SUM(clicks) AS clicks FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY device",
    params: { s: w.start, e: w.end },
  });
  const devTotal = devRows.reduce((a: number, r: any) => a + Number(r.clicks), 0) || 1;
  const devMap: Record<string, number> = Object.fromEntries(devRows.map((r: any) => [r.device, Number(r.clicks)]));
  return {
    kpis: [
      kpi("Cost", Math.round(cur.spend), "$", { hero: true, prior: prev.spend }),
      kpi("Impressions", cur.impressions, "c", { prior: prev.impressions }),
      kpi("Clicks", cur.clicks, "n", { prior: prev.clicks }),
      kpi("CTR", Math.round(div(cur.clicks, cur.impressions) * 10000) / 100, "%", { rate: true, prior: div(prev.clicks, prev.impressions) * 100 }),
      kpi("Avg. CPC", Math.round(div(cur.spend, cur.clicks) * 100) / 100, "$2", { rate: true, good: "down", prior: div(prev.spend, prev.clicks) }),
      kpi("Conversions", Math.round(cur.conversions), "n", { prior: prev.conversions }),
      kpi("Cost / Conv.", Math.round(div(cur.spend, cur.conversions)), "$", { rate: true, good: "down", prior: div(prev.spend, prev.conversions) }),
      kpi("ROAS", Math.round(div(cur.convValue, cur.spend) * 10) / 10, "x", { rate: true, prior: div(prev.convValue, prev.spend) }),
      kpi("CPM", Math.round(div(cur.spend, cur.impressions) * 1000 * 100) / 100, "$2", { rate: true, good: "down", prior: div(prev.spend, prev.impressions) * 1000 }),
    ],
    campaigns: campRows.map((r: any) => ({
      name: r.campaign_name, status: r.status === "ENABLED" ? "on" : "off",
      cost: Math.round(Number(r.cost)), clicks: Number(r.clicks),
      ctr: Math.round(div(Number(r.clicks), Number(r.impressions)) * 10000) / 100,
      conv: Math.round(Number(r.conv)), cpa: Math.round(div(Number(r.cost), Number(r.conv)) * 10) / 10,
      roas: Math.round(div(Number(r.value), Number(r.cost)) * 10) / 10,
    })),
    devices: {
      labels: ["Mobile", "Desktop", "Tablet"],
      data: ["MOBILE", "DESKTOP", "TABLET"].map((d) => Math.round(div(devMap[d] || 0, devTotal) * 100)),
    },
    base: { clicks: cur.clicks, spend: cur.spend, impressions: cur.impressions },
  };
}

async function campaign(bq: BigQuery, ds: string, w: ReturnType<typeof windowFor>) {
  const [cur, prev] = await Promise.all([agg(bq, ds, w.start, w.end), agg(bq, ds, w.prevStart, w.prevEnd)]);
  const [chRows] = await bq.query({
    query:
      "SELECT channel_type, SUM(cost_micros)/1e6 AS spend, SUM(conversions) AS conv, SUM(conversions_value) AS value " +
      "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY channel_type ORDER BY spend DESC",
    params: { s: w.start, e: w.end },
  });
  const label = (t: string) => (({ SEARCH: "Google Search", PERFORMANCE_MAX: "Performance Max", SHOPPING: "Shopping", DISPLAY: "Display" } as Record<string, string>)[t] || t);
  return {
    kpis: [
      kpi("Total Ad Spend", Math.round(cur.spend), "$", { hero: true, prior: prev.spend }),
      kpi("Total Reach", cur.impressions, "c", { prior: prev.impressions }),
      kpi("Conversions", Math.round(cur.conversions), "n", { prior: prev.conversions }),
      kpi("Attributed Revenue", Math.round(cur.convValue), "$", { prior: prev.convValue }),
      kpi("Blended ROAS", Math.round(div(cur.convValue, cur.spend) * 10) / 10, "x", { rate: true, prior: div(prev.convValue, prev.spend) }),
      kpi("Cost / Conv.", Math.round(div(cur.spend, cur.conversions) * 10) / 10, "$", { rate: true, good: "down", prior: div(prev.spend, prev.conversions) }),
    ],
    mix: { labels: chRows.map((r: any) => label(r.channel_type)), data: chRows.map((r: any) => Math.round(Number(r.spend))) },
    channels: chRows.map((r: any) => ({
      ch: label(r.channel_type), spend: Math.round(Number(r.spend)), conv: Math.round(Number(r.conv)),
      roas: Math.round(div(Number(r.value), Number(r.spend)) * 10) / 10, rev: Math.round(Number(r.value)),
    })),
  };
}

const MODULES: Record<string, (bq: BigQuery, ds: string, w: ReturnType<typeof windowFor>) => Promise<any>> = { googleAds, campaign };

export default async function handler(req: any, res: any) {
  const moduleKey = String(req.query.module || "").replace(/[^a-zA-Z0-9]/g, "");
  const clientSlug = String(req.query.client || "");
  const rangeKey = String(req.query.range || "30d").replace(/[^a-z0-9]/g, "") || "30d";
  const dataset = CLIENT_DATASETS[clientSlug]; // allowlist gate — no raw identifier in SQL
  if (!moduleKey) { res.status(400).json({ error: "missing module" }); return; }
  if (!dataset) { res.status(403).json({ error: "unknown client" }); return; }
  const handler = MODULES[moduleKey];
  if (!handler) { res.status(404).json({ error: "module not mapped to a mart yet" }); return; }
  const bq = client();
  if (!bq) { res.status(503).json({ error: "BigQuery not configured (GCP_PROJECT / GCP_SA_KEY)" }); return; }
  try {
    const w = windowFor(rangeKey);
    const body = await handler(bq, dataset, w);
    res.status(200).json({ module: moduleKey, client: clientSlug, source: "bq-mart", real_window: true, window: w, ...body });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "bq query failed" });
  }
}
