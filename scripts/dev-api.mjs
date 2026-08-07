/* ============================================================
   dev-api.mjs — local /api/bq server backed by the BigQuery emulator.

   Serves the SAME contract as api/bq/[module].ts but computes everything
   from fact_ads_campaign_daily with REAL date-range SQL — no scaling
   factors. Deltas are real too (previous window of equal length).

   Run:  npm run dev:api        (vite proxies /api → :8790, see vite.config)
   ============================================================ */
import http from "node:http";
import { BigQuery } from "@google-cloud/bigquery";

const PORT = 8790;
const DATA_END = "2026-08-06"; // dummy-data anchor (yesterday at generation time)
const bq = new BigQuery({ projectId: "entangle-local", apiEndpoint: "http://localhost:9050" });

const CLIENT_DATASETS = {
  "aqua-pulse-spas": "client_aqua_pulse_spas",
  "care-for-you-at-home": "client_care_for_you_at_home",
  "ms-plus": "client_ms_plus",
};

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (s, days) => iso(new Date(new Date(s + "T00:00:00Z").getTime() + days * 86400000));
function windowFor(rangeKey) {
  const end = DATA_END;
  const days = { "7d": 7, "30d": 30, qtd: 37 /* Jul 1 → Aug 6 */, ytd: 90 }[rangeKey] ?? 30;
  const start = rangeKey === "qtd" ? "2026-07-01" : shift(end, -(days - 1));
  return { start, end, prevStart: shift(start, -days), prevEnd: shift(start, -1) };
}
const kpi = (l, v, fmt, o = {}) => {
  const k = { l, v, fmt, ...o };
  if (o.prior != null && o.prior !== 0) {
    const d = ((v - o.prior) / o.prior) * 100;
    k.d = Math.abs(Math.round(d * 10) / 10);
    k.dir = d >= 0 ? "up" : "down";
  }
  delete k.prior;
  return k;
};
const div = (a, b) => (b ? a / b : 0);

async function agg(ds, start, end) {
  const [rows] = await bq.query({
    query:
      "SELECT SUM(cost_micros)/1e6 AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks, " +
      "SUM(conversions) AS conversions, SUM(conversions_value) AS conv_value " +
      "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e",
    params: { s: start, e: end },
  });
  const r = rows[0] || {};
  return { spend: r.spend || 0, impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0), conversions: r.conversions || 0, convValue: r.conv_value || 0 };
}

async function googleAds(ds, w) {
  const [cur, prev] = await Promise.all([agg(ds, w.start, w.end), agg(ds, w.prevStart, w.prevEnd)]);
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
  const devTotal = devRows.reduce((a, r) => a + Number(r.clicks), 0) || 1;
  const devMap = Object.fromEntries(devRows.map((r) => [r.device, Number(r.clicks)]));

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
    campaigns: campRows.map((r) => ({
      name: r.campaign_name, status: r.status === "ENABLED" ? "on" : "off",
      cost: Math.round(r.cost), clicks: Number(r.clicks),
      ctr: Math.round(div(Number(r.clicks), Number(r.impressions)) * 10000) / 100,
      conv: Math.round(r.conv), cpa: Math.round(div(r.cost, r.conv) * 10) / 10,
      roas: Math.round(div(r.value, r.cost) * 10) / 10,
    })),
    devices: {
      labels: ["Mobile", "Desktop", "Tablet"],
      data: ["MOBILE", "DESKTOP", "TABLET"].map((d) => Math.round(div(devMap[d] || 0, devTotal) * 100)),
    },
    base: { clicks: cur.clicks, spend: cur.spend, impressions: cur.impressions },
  };
}

async function campaign(ds, w) {
  const [cur, prev] = await Promise.all([agg(ds, w.start, w.end), agg(ds, w.prevStart, w.prevEnd)]);
  const [chRows] = await bq.query({
    query:
      "SELECT channel_type, SUM(cost_micros)/1e6 AS spend, SUM(conversions) AS conv, SUM(conversions_value) AS value " +
      "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY channel_type ORDER BY spend DESC",
    params: { s: w.start, e: w.end },
  });
  const label = (t) => ({ SEARCH: "Google Search", PERFORMANCE_MAX: "Performance Max", SHOPPING: "Shopping", DISPLAY: "Display" }[t] || t);
  return {
    kpis: [
      kpi("Total Ad Spend", Math.round(cur.spend), "$", { hero: true, prior: prev.spend }),
      kpi("Total Reach", cur.impressions, "c", { prior: prev.impressions }),
      kpi("Conversions", Math.round(cur.conversions), "n", { prior: prev.conversions }),
      kpi("Attributed Revenue", Math.round(cur.convValue), "$", { prior: prev.convValue }),
      kpi("Blended ROAS", Math.round(div(cur.convValue, cur.spend) * 10) / 10, "x", { rate: true, prior: div(prev.convValue, prev.spend) }),
      kpi("Cost / Conv.", Math.round(div(cur.spend, cur.conversions) * 10) / 10, "$", { rate: true, good: "down", prior: div(prev.spend, prev.conversions) }),
    ],
    mix: { labels: chRows.map((r) => label(r.channel_type)), data: chRows.map((r) => Math.round(r.spend)) },
    channels: chRows.map((r) => ({
      ch: label(r.channel_type), spend: Math.round(r.spend), conv: Math.round(r.conv),
      roas: Math.round(div(r.value, r.spend) * 10) / 10, rev: Math.round(r.value),
    })),
  };
}

const MODULES = { googleAds, campaign };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const m = u.pathname.match(/^\/api\/bq\/([a-zA-Z0-9]+)$/);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (!m) return send(404, { error: "not found" });
  const ds = CLIENT_DATASETS[u.searchParams.get("client") || ""];
  if (!ds) return send(403, { error: "unknown client" });
  const handler = MODULES[m[1]];
  if (!handler) return send(404, { error: "module not mapped to mart yet" });
  try {
    const w = windowFor(u.searchParams.get("range") || "30d");
    send(200, { module: m[1], source: "emulator-mart", real_window: true, window: w, ...(await handler(ds, w)) });
  } catch (e) { send(500, { error: e.message }); }
}).listen(PORT, () => console.log(`dev-api on http://localhost:${PORT} → emulator marts (fact_ads_campaign_daily)`));
