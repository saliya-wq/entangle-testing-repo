/* ============================================================
   bq-modules.mjs — the ONE implementation of "module → mart SQL".
   Imported by both:
     - api/bq/[module].ts   (Vercel, real BigQuery)
     - scripts/dev-api.mjs  (local, BigQuery emulator)
   so local and production can never drift.

   Every module computes from per-client marts with REAL date windows
   (WHERE date BETWEEN) and REAL previous-window deltas. No scale factors.
   ============================================================ */

/* Dummy-data anchor. Delete once real transfers supply current dates. */
export const DATA_END = "2026-08-06";

export const CLIENT_DATASETS = {
  "aqua-pulse-spas": "client_aqua_pulse_spas",
  "care-for-you-at-home": "client_care_for_you_at_home",
  "ms-plus": "client_ms_plus",
};

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (s, days) => iso(new Date(new Date(s + "T00:00:00Z").getTime() + days * 86400000));
export function windowFor(rangeKey) {
  const end = DATA_END;
  const days = { "7d": 7, "30d": 30, qtd: 37, ytd: 90 }[rangeKey] ?? 30;
  const start = rangeKey === "qtd" ? "2026-07-01" : shift(end, -(days - 1));
  return { start, end, prevStart: shift(start, -days), prevEnd: shift(start, -1) };
}

const div = (a, b) => (b ? a / b : 0);
const n = (x) => Number(x || 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

function kpi(l, v, fmt, o = {}) {
  const k = { l, v, fmt, ...o };
  if (o.prior != null && o.prior !== 0) {
    const d = ((v - o.prior) / o.prior) * 100;
    k.d = Math.abs(r1(d));
    k.dir = d >= 0 ? "up" : "down";
  }
  delete k.prior;
  return k;
}
const q = async (bq, query, params) => (await bq.query({ query, params }))[0];

/* ---------- Google Ads mart ---------- */
async function aggAds(bq, ds, s, e) {
  const [r = {}] = await q(bq,
    "SELECT SUM(cost_micros)/1e6 AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks, " +
    "SUM(conversions) AS conversions, SUM(conversions_value) AS conv_value " +
    "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e", { s, e });
  return { spend: n(r.spend), impressions: n(r.impressions), clicks: n(r.clicks), conversions: n(r.conversions), convValue: n(r.conv_value) };
}

/* ---------- Meta mart ----------
   NOTE on reach: Meta reach is unique users, so summing it across days/devices
   overstates true period reach (real reach must be pulled at the period grain).
   Kept as a sum here and labelled "Reach (sum)" semantics — flagged deliberately. */
async function aggMeta(bq, ds, s, e) {
  const [r = {}] = await q(bq,
    "SELECT SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(reach) AS reach, SUM(clicks) AS clicks, " +
    "SUM(link_clicks) AS link_clicks, SUM(purchases) AS purchases, SUM(purchase_value) AS purchase_value, SUM(leads) AS leads " +
    "FROM `" + ds + ".fact_meta_campaign_daily` WHERE date BETWEEN @s AND @e", { s, e });
  return {
    spend: n(r.spend), impressions: n(r.impressions), reach: n(r.reach), clicks: n(r.clicks),
    linkClicks: n(r.link_clicks), purchases: n(r.purchases), purchaseValue: n(r.purchase_value), leads: n(r.leads),
  };
}

/* ================= modules ================= */

async function googleAds(bq, ds, w) {
  const [cur, prev] = await Promise.all([aggAds(bq, ds, w.start, w.end), aggAds(bq, ds, w.prevStart, w.prevEnd)]);
  const camps = await q(bq,
    "SELECT campaign_name, ANY_VALUE(campaign_status) AS status, SUM(cost_micros)/1e6 AS cost, SUM(clicks) AS clicks, " +
    "SUM(impressions) AS impressions, SUM(conversions) AS conv, SUM(conversions_value) AS value " +
    "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY campaign_name ORDER BY cost DESC",
    { s: w.start, e: w.end });
  const devs = await q(bq,
    "SELECT device, SUM(clicks) AS clicks FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY device",
    { s: w.start, e: w.end });
  const devTotal = devs.reduce((a, r) => a + n(r.clicks), 0) || 1;
  const devMap = Object.fromEntries(devs.map((r) => [r.device, n(r.clicks)]));
  return {
    kpis: [
      kpi("Cost", Math.round(cur.spend), "$", { hero: true, prior: prev.spend }),
      kpi("Impressions", cur.impressions, "c", { prior: prev.impressions }),
      kpi("Clicks", cur.clicks, "n", { prior: prev.clicks }),
      kpi("CTR", r2(div(cur.clicks, cur.impressions) * 100), "%", { rate: true, prior: div(prev.clicks, prev.impressions) * 100 }),
      kpi("Avg. CPC", r2(div(cur.spend, cur.clicks)), "$2", { rate: true, good: "down", prior: div(prev.spend, prev.clicks) }),
      kpi("Conversions", Math.round(cur.conversions), "n", { prior: prev.conversions }),
      kpi("Cost / Conv.", Math.round(div(cur.spend, cur.conversions)), "$", { rate: true, good: "down", prior: div(prev.spend, prev.conversions) }),
      kpi("ROAS", r1(div(cur.convValue, cur.spend)), "x", { rate: true, prior: div(prev.convValue, prev.spend) }),
      kpi("CPM", r2(div(cur.spend, cur.impressions) * 1000), "$2", { rate: true, good: "down", prior: div(prev.spend, prev.impressions) * 1000 }),
    ],
    campaigns: camps.map((r) => ({
      name: r.campaign_name, status: r.status === "ENABLED" ? "on" : "off",
      cost: Math.round(n(r.cost)), clicks: n(r.clicks), ctr: r2(div(n(r.clicks), n(r.impressions)) * 100),
      conv: Math.round(n(r.conv)), cpa: r1(div(n(r.cost), n(r.conv))), roas: r1(div(n(r.value), n(r.cost))),
    })),
    devices: {
      labels: ["Mobile", "Desktop", "Tablet"],
      data: ["MOBILE", "DESKTOP", "TABLET"].map((d) => Math.round(div(devMap[d] || 0, devTotal) * 100)),
    },
    base: { clicks: cur.clicks, spend: cur.spend, impressions: cur.impressions },
  };
}

async function fbAds(bq, ds, w) {
  const [cur, prev] = await Promise.all([aggMeta(bq, ds, w.start, w.end), aggMeta(bq, ds, w.prevStart, w.prevEnd)]);
  const camps = await q(bq,
    "SELECT campaign_name, ANY_VALUE(campaign_status) AS status, SUM(spend) AS spend, SUM(reach) AS reach, " +
    "SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(purchases) AS purchases, SUM(purchase_value) AS value " +
    "FROM `" + ds + ".fact_meta_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY campaign_name ORDER BY spend DESC",
    { s: w.start, e: w.end });
  const [plc, demo] = await Promise.all([
    q(bq, "SELECT segments_publisher_platform AS platform, segments_platform_position AS position, SUM(metrics_spend) AS spend " +
      "FROM `" + ds + ".meta_CampaignPlacements` WHERE segments_date BETWEEN @s AND @e GROUP BY 1,2 ORDER BY spend DESC", { s: w.start, e: w.end }),
    q(bq, "SELECT segments_age AS age, segments_gender AS gender, SUM(metrics_reach) AS reach " +
      "FROM `" + ds + ".meta_CampaignDemographics` WHERE segments_date BETWEEN @s AND @e GROUP BY 1,2", { s: w.start, e: w.end }),
  ]);
  const AGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  const pctOf = (g) => { const t = demo.reduce((a, r) => a + n(r.reach), 0) || 1;
    return AGES.map((a) => Math.round((n(demo.find((r) => r.age === a && r.gender === g)?.reach) / t) * 100)); };
  const posLabel = (p, q2) => `${p === "facebook" ? "Facebook" : p === "instagram" ? "Instagram" : "Audience Net."} ${
    { feed: "Feed", stream: "Feed", story: "Stories", reels: "Reels", video_feeds: "Video", right_hand_column: "Right col.", classic: "" }[q2] || q2}`.trim();
  return {
    kpis: [
      kpi("Amount Spent", Math.round(cur.spend), "$", { hero: true, prior: prev.spend }),
      kpi("Reach", cur.reach, "c", { prior: prev.reach }),
      kpi("Impressions", cur.impressions, "c", { prior: prev.impressions }),
      kpi("Link Clicks", cur.linkClicks, "n", { prior: prev.linkClicks }),
      kpi("CTR", r2(div(cur.clicks, cur.impressions) * 100), "%", { rate: true, prior: div(prev.clicks, prev.impressions) * 100 }),
      kpi("CPM", r2(div(cur.spend, cur.impressions) * 1000), "$2", { rate: true, good: "down", prior: div(prev.spend, prev.impressions) * 1000 }),
      kpi("Purchases", Math.round(cur.purchases), "n", { prior: prev.purchases }),
      kpi("ROAS", r1(div(cur.purchaseValue, cur.spend)), "x", { rate: true, prior: div(prev.purchaseValue, prev.spend) }),
    ],
    campaigns: camps.map((r) => ({
      name: r.campaign_name, status: r.status === "ACTIVE" ? "on" : "off",
      spend: Math.round(n(r.spend)), reach: n(r.reach), ctr: r2(div(n(r.clicks), n(r.impressions)) * 100),
      results: Math.round(n(r.purchases)), roas: r1(div(n(r.value), n(r.spend))),
    })),
    placements: { labels: plc.map((r) => posLabel(r.platform, r.position)), data: plc.map((r) => Math.round(n(r.spend))) },
    demo: { labels: AGES, women: pctOf("female"), men: pctOf("male") },
    base: { spend: cur.spend, impressions: cur.impressions, clicks: cur.clicks },
  };
}

/* ---------- GA4 mart (built from event-level data via UNNEST) ---------- */
async function aggGa4(bq, ds, s, e) {
  const [r = {}] = await q(bq,
    "SELECT SUM(sessions) AS sessions, SUM(users) AS users, SUM(engaged_sessions) AS engaged, " +
    "SUM(page_views) AS page_views, SUM(purchases) AS purchases, SUM(leads) AS leads, SUM(revenue) AS revenue, " +
    "SUM(add_to_carts) AS add_to_carts, SUM(checkouts) AS checkouts, SUM(view_items) AS view_items, " +
    "SUM(engagement_msec) AS engagement_msec " +
    "FROM `" + ds + ".fact_ga4_daily` WHERE date BETWEEN @s AND @e", { s, e });
  return {
    sessions: n(r.sessions), users: n(r.users), engaged: n(r.engaged), pageViews: n(r.page_views),
    purchases: n(r.purchases), leads: n(r.leads), revenue: n(r.revenue),
    addToCarts: n(r.add_to_carts), checkouts: n(r.checkouts), viewItems: n(r.view_items),
    engagementMsec: n(r.engagement_msec),
  };
}

async function ga4(bq, ds, w) {
  const [cur, prev] = await Promise.all([aggGa4(bq, ds, w.start, w.end), aggGa4(bq, ds, w.prevStart, w.prevEnd)]);
  const [chRows, devRows] = await Promise.all([
    q(bq, "SELECT channel_group, SUM(sessions) AS sessions, SUM(purchases) AS purchases, SUM(revenue) AS revenue " +
      "FROM `" + ds + ".fact_ga4_daily` WHERE date BETWEEN @s AND @e GROUP BY 1 ORDER BY sessions DESC", { s: w.start, e: w.end }),
    q(bq, "SELECT device, SUM(sessions) AS sessions FROM `" + ds + ".fact_ga4_daily` " +
      "WHERE date BETWEEN @s AND @e GROUP BY 1 ORDER BY sessions DESC", { s: w.start, e: w.end }),
  ]);
  const devTotal = devRows.reduce((a, r) => a + n(r.sessions), 0) || 1;
  const cap = (x) => (x || "").charAt(0).toUpperCase() + (x || "").slice(1);
  return {
    kpis: [
      kpi("Users", cur.users, "c", { hero: true, prior: prev.users }),
      kpi("Sessions", cur.sessions, "c", { prior: prev.sessions }),
      kpi("Engagement Rate", r2(div(cur.engaged, cur.sessions) * 100), "%", { rate: true, prior: div(prev.engaged, prev.sessions) * 100 }),
      kpi("Avg. Engagement", Math.round(div(cur.engagementMsec / 1000, cur.sessions)), "sec", { rate: true, prior: div(prev.engagementMsec / 1000, prev.sessions) }),
      kpi("Conversion Rate", r2(div(cur.purchases, cur.sessions) * 100), "%", { rate: true, prior: div(prev.purchases, prev.sessions) * 100 }),
      kpi("Add-to-Cart Rate", r2(div(cur.addToCarts, cur.sessions) * 100), "%", { rate: true, prior: div(prev.addToCarts, prev.sessions) * 100 }),
      kpi("Cart Abandonment", r2((1 - div(cur.purchases, cur.addToCarts)) * 100), "%", { rate: true, good: "down", prior: (1 - div(prev.purchases, prev.addToCarts)) * 100 }),
      kpi("Ecom. Revenue", Math.round(cur.revenue), "$", { prior: prev.revenue }),
    ],
    channels: chRows.map((r) => ({
      ch: r.channel_group, sess: n(r.sessions),
      cr: r2(div(n(r.purchases), n(r.sessions)) * 100), rev: Math.round(n(r.revenue)),
    })),
    devices: {
      labels: devRows.map((r) => cap(r.device)),
      data: devRows.map((r) => Math.round(div(n(r.sessions), devTotal) * 100)),
    },
    /* the real GA4 funnel, straight from event counts */
    funnel: [
      { s: "Sessions", v: cur.sessions }, { s: "Product Views", v: cur.viewItems },
      { s: "Add to Cart", v: cur.addToCarts }, { s: "Checkout", v: cur.checkouts },
      { s: "Purchase", v: cur.purchases },
    ],
    base: { sessions: cur.sessions, users: cur.users, revenue: cur.revenue },
  };
}

/* Blended across BOTH platforms — the point of the Campaign module. */
async function campaign(bq, ds, w) {
  const [ga, gaPrev, mt, mtPrev] = await Promise.all([
    aggAds(bq, ds, w.start, w.end), aggAds(bq, ds, w.prevStart, w.prevEnd),
    aggMeta(bq, ds, w.start, w.end), aggMeta(bq, ds, w.prevStart, w.prevEnd),
  ]);
  const cur = {
    spend: ga.spend + mt.spend, impressions: ga.impressions + mt.impressions,
    conversions: ga.conversions + mt.purchases, convValue: ga.convValue + mt.purchaseValue,
  };
  const prev = {
    spend: gaPrev.spend + mtPrev.spend, impressions: gaPrev.impressions + mtPrev.impressions,
    conversions: gaPrev.conversions + mtPrev.purchases, convValue: gaPrev.convValue + mtPrev.purchaseValue,
  };
  const gaCh = await q(bq,
    "SELECT channel_type, SUM(cost_micros)/1e6 AS spend, SUM(conversions) AS conv, SUM(conversions_value) AS value " +
    "FROM `" + ds + ".fact_ads_campaign_daily` WHERE date BETWEEN @s AND @e GROUP BY channel_type", { s: w.start, e: w.end });
  const label = { SEARCH: "Google Search", PERFORMANCE_MAX: "Performance Max", SHOPPING: "Shopping", DISPLAY: "Display" };
  const channels = [
    ...gaCh.map((r) => ({ ch: label[r.channel_type] || r.channel_type, spend: Math.round(n(r.spend)), conv: Math.round(n(r.conv)), rev: Math.round(n(r.value)), roas: r1(div(n(r.value), n(r.spend))) })),
    { ch: "Meta Ads", spend: Math.round(mt.spend), conv: Math.round(mt.purchases), rev: Math.round(mt.purchaseValue), roas: r1(div(mt.purchaseValue, mt.spend)) },
  ].sort((a, b) => b.spend - a.spend);
  return {
    kpis: [
      kpi("Total Ad Spend", Math.round(cur.spend), "$", { hero: true, prior: prev.spend }),
      kpi("Total Reach", cur.impressions, "c", { prior: prev.impressions }),
      kpi("Conversions", Math.round(cur.conversions), "n", { prior: prev.conversions }),
      kpi("Attributed Revenue", Math.round(cur.convValue), "$", { prior: prev.convValue }),
      kpi("Blended ROAS", r1(div(cur.convValue, cur.spend)), "x", { rate: true, prior: div(prev.convValue, prev.spend) }),
      kpi("Cost / Conv.", r1(div(cur.spend, cur.conversions)), "$", { rate: true, good: "down", prior: div(prev.spend, prev.conversions) }),
    ],
    mix: { labels: channels.map((c) => c.ch), data: channels.map((c) => c.spend) },
    channels,
  };
}

export const MODULES = { googleAds, fbAds, ga4, campaign };
