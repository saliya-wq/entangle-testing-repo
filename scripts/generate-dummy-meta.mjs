/* ============================================================
   generate-dummy-meta.mjs — realistic Meta (Facebook/Instagram) Ads
   dummy data, shaped to local-bq/schemas/meta_ads.

   Same 90-day window and clients as the Google Ads generator so the two
   platforms blend coherently in the Campaign module.

   Meta-specific realism:
   - objectives per campaign (OUTCOME_SALES / _LEADS / _AWARENESS / _TRAFFIC)
   - reach + frequency (impressions = reach x frequency) — Meta's distinctive pair
   - actions[] modelled as its own long table (meta_CampaignActions): one row
     per campaign x date x action_type, with attribution-window columns
     (1d_view / 7d_click / 28d_click) that sum to the default total
   - placements: facebook|instagram x feed|stories|reels x device
   - age x gender demographics
   - video metrics on video-led campaigns
   - 28-DAY RESTATEMENT: recent days show partially-matured conversions
   - money as FLOAT64 (Meta returns spend as a decimal string), ids as STRING

   Usage: npm run gen:dummy:meta      (or npm run bq:seed-local)
   ============================================================ */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "local-bq", "dummy");
const SCHEMA_DIR = path.join(process.cwd(), "local-bq", "schemas", "meta_ads");
const END = new Date("2026-08-06T00:00:00Z");
const DAYS = 90;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLIENTS = [
  { slug: "aqua-pulse-spas", name: "Aqua Pulse Spas", actId: "act_100000000000001", f: 1.0, aov: 900 },
  { slug: "care-for-you-at-home", name: "Care For You at Home", actId: "act_100000000000002", f: 0.42, aov: 350 },
  { slug: "ms-plus", name: "MS Plus", actId: "act_100000000000003", f: 1.8, aov: 1400 },
];

/* Campaign portfolio — mirrors the dashboard's Meta sample campaigns */
const CAMPAIGNS = [
  { idx: 1, name: "Summer Lookbook",        objective: "OUTCOME_SALES",     imprBase: 26000, ctr: 0.034, cpm: 9.5,  cvr: 0.00175, budget: 220, video: false },
  { idx: 2, name: "UGC Video — Rattan",     objective: "OUTCOME_SALES",     imprBase: 21000, ctr: 0.039, cpm: 8.2,  cvr: 0.002, budget: 180, video: true },
  { idx: 3, name: "Clearance — Catalogue",  objective: "OUTCOME_SALES",     imprBase: 18000, ctr: 0.026, cpm: 7.4,  cvr: 0.00125, budget: 140, video: false },
  { idx: 4, name: "Retargeting — Dynamic",  objective: "OUTCOME_SALES",     imprBase: 8000,  ctr: 0.048, cpm: 13.0, cvr: 0.00433, budget: 110, video: false },
  { idx: 5, name: "Prospecting — Lookalike", objective: "OUTCOME_LEADS",    imprBase: 15000, ctr: 0.019, cpm: 6.8,  cvr: 0.00092, budget: 100, video: true, status: "PAUSED" },
];

const DOW = [1.02, 1.05, 1.04, 1.03, 1.0, 0.86, 0.83]; // Meta weekends dip less than Search
const PLACEMENTS = [
  ["facebook", "feed", "mobile_app", 0.34], ["facebook", "video_feeds", "mobile_app", 0.08],
  ["instagram", "stream", "mobile_app", 0.24], ["instagram", "story", "mobile_app", 0.14],
  ["instagram", "reels", "mobile_app", 0.12], ["facebook", "right_hand_column", "desktop", 0.04],
  ["audience_network", "classic", "mobile_app", 0.04],
];
const DEVICES = [["android_smartphone", 0.41], ["iphone", 0.38], ["desktop", 0.15], ["ipad", 0.06]];
const AGES = [["18-24", 0.09], ["25-34", 0.24], ["35-44", 0.28], ["45-54", 0.22], ["55-64", 0.12], ["65+", 0.05]];
const GENDERS = [["female", 0.62], ["male", 0.36], ["unknown", 0.02]];
/* action_type taxonomy → share of the campaign's action volume */
const ACTIONS = [
  { type: "link_click", share: 1.0, valued: false },
  { type: "landing_page_view", share: 0.72, valued: false },
  { type: "post_engagement", share: 1.6, valued: false },
  { type: "page_engagement", share: 1.7, valued: false },
  { type: "add_to_cart", share: 0.05, valued: true, valueMult: 0.35 },
  { type: "initiate_checkout", share: 0.025, valued: true, valueMult: 0.6 },
  /* share: null → use the campaign's own cvr, so the purchase rows in
     meta_CampaignActions and the ROAS in meta_CampaignStats always agree */
  { type: "offsite_conversion.fb_pixel_purchase", share: null, valued: true, valueMult: 1.0 },
  { type: "lead", share: 0.02, valued: false },
];
/* conversion maturity by recency — Meta restates for ~28 days */
const lagMaturity = (daysAgo) => (daysAgo >= 28 ? 1 : 0.5 + 0.5 * (daysAgo / 28));

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const datasetOf = (slug) => "client_" + slug.replace(/-/g, "_");
const r2 = (x) => Math.round(x * 100) / 100;

/* Build rows with only columns that exist in the schema (fills the rest as null) */
const schemas = {};
for (const t of ["meta_Account", "meta_Campaign", "meta_CampaignStats", "meta_CampaignActions", "meta_CampaignDemographics", "meta_CampaignPlacements"]) {
  schemas[t] = new Set(JSON.parse(await readFile(path.join(SCHEMA_DIR, `${t}.json`), "utf8")).map((c) => c.name));
}
const pick = (table, obj) => {
  const allowed = schemas[table];
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (allowed.has(k) && v !== undefined) out[k] = v;
  return out;
};

let totalRows = 0;
for (const client of CLIENTS) {
  const rand = rng(parseInt(client.actId.slice(-6), 10));
  const ds = datasetOf(client.slug);
  const dir = path.join(OUT, ds);
  await mkdir(dir, { recursive: true });
  const latest = iso(END);
  const rows = { meta_Account: [], meta_Campaign: [], meta_CampaignStats: [], meta_CampaignActions: [], meta_CampaignDemographics: [], meta_CampaignPlacements: [] };
  const ident = { account_id: client.actId, account_name: client.name, account_currency: "AUD", account_timezone_name: "Australia/Sydney" };

  for (let dayIdx = DAYS - 1; dayIdx >= 0; dayIdx--) {
    const date = addDays(END, -dayIdx);
    const d = iso(date);
    const season = DOW[(date.getUTCDay() + 6) % 7];
    const growth = 1 + 0.22 * ((DAYS - 1 - dayIdx) / (DAYS - 1));
    const maturity = lagMaturity(dayIdx);

    rows.meta_Account.push(pick("meta_Account", {
      ...ident, account_status: 1, account_business_name: client.name,
      account_amount_spent: 0, account_spend_cap: 0, account_created_time: "2024-02-01T00:00:00+1100",
      _DATA_DATE: d, _LATEST_DATE: latest,
    }));

    for (const c of CAMPAIGNS) {
      const campaignId = String(23850000000000000 + c.idx * 1000 + parseInt(client.actId.slice(-1), 10));
      const paused = c.status === "PAUSED";
      rows.meta_Campaign.push(pick("meta_Campaign", {
        ...ident, campaign_id: campaignId, campaign_name: c.name, campaign_objective: c.objective,
        campaign_status: paused ? "PAUSED" : "ACTIVE",
        campaign_effective_status: paused ? "PAUSED" : "ACTIVE",
        campaign_configured_status: paused ? "PAUSED" : "ACTIVE",
        campaign_buying_type: "AUCTION", campaign_bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        campaign_daily_budget: Math.round(c.budget * client.f * 100), // minor units
        campaign_budget_remaining: Math.round(c.budget * client.f * 100 * 0.35),
        campaign_start_time: "2024-03-01T00:00:00+1100",
        campaign_created_time: "2024-02-20T00:00:00+1100", campaign_updated_time: d + "T03:00:00+1000",
        campaign_special_ad_categories: [], campaign_can_use_spend_cap: true,
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));
      if (paused && dayIdx < 25) continue; // paused 25 days ago

      const noise = 0.86 + rand() * 0.28;
      const impressions = Math.round(c.imprBase * client.f * season * growth * noise);
      const frequency = r2(1.6 + rand() * 1.1);
      const reach = Math.round(impressions / frequency);
      const clicks = Math.round(impressions * c.ctr * (0.9 + rand() * 0.2));
      const inlineLink = Math.round(clicks * 0.62);
      const spend = r2((impressions / 1000) * c.cpm * (0.92 + rand() * 0.16));
      const purchases = r2(inlineLink * c.cvr * (0.85 + rand() * 0.3) * maturity);
      const purchaseValue = r2(purchases * client.aov * (0.9 + rand() * 0.2));
      const roas = spend ? r2(purchaseValue / spend) : 0;
      const base = {
        ...ident, campaign_id: campaignId, campaign_name: c.name, campaign_objective: c.objective,
        segments_date: d, segments_date_stop: d, segments_level: "campaign",
        segments_attribution_setting: "7d_click_1d_view", segments_action_report_time: "impression",
        segments_action_attribution_windows: ["7d_click", "1d_view"], // REPEATED in the schema
        segments_time_increment: "1",
        _DATA_DATE: d, _LATEST_DATE: latest,
      };

      /* stats split by impression device */
      for (const [device, shareBase] of DEVICES) {
        const share = shareBase * (0.9 + rand() * 0.2);
        const di = Math.round(impressions * share);
        if (!di) continue;
        const dc = Math.round(clicks * share), dsp = r2(spend * share);
        const dReach = Math.round(reach * share), dPur = r2(purchases * share), dVal = r2(purchaseValue * share);
        rows.meta_CampaignStats.push(pick("meta_CampaignStats", {
          ...base, segments_impression_device: device,
          segments_device_platform: device === "desktop" ? "desktop" : "mobile",
          metrics_impressions: di, metrics_reach: dReach, metrics_frequency: dReach ? r2(di / dReach) : 0,
          metrics_spend: dsp, metrics_social_spend: 0,
          metrics_clicks: dc, metrics_unique_clicks: Math.round(dc * 0.86),
          metrics_inline_link_clicks: Math.round(inlineLink * share),
          metrics_unique_inline_link_clicks: Math.round(inlineLink * share * 0.85),
          metrics_ctr: di ? r2((dc / di) * 100) : 0,
          metrics_unique_ctr: dReach ? r2((dc * 0.86 / dReach) * 100) : 0,
          metrics_inline_link_click_ctr: di ? r2((inlineLink * share / di) * 100) : 0,
          metrics_cpc: dc ? r2(dsp / dc) : 0, metrics_cpm: di ? r2((dsp / di) * 1000) : 0,
          metrics_cpp: dReach ? r2((dsp / dReach) * 1000) : 0,
          metrics_cost_per_inline_link_click: inlineLink ? r2(dsp / (inlineLink * share)) : 0,
          metrics_purchase_roas: roas, metrics_website_purchase_roas: roas,
          metrics_quality_ranking: c.idx <= 2 ? "ABOVE_AVERAGE" : "AVERAGE",
          metrics_engagement_rate_ranking: c.idx <= 2 ? "ABOVE_AVERAGE" : "AVERAGE",
          metrics_conversion_rate_ranking: c.idx === 4 ? "ABOVE_AVERAGE" : "AVERAGE",
          ...(c.video ? {
            metrics_video_play_actions: Math.round(di * 0.42),
            metrics_video_thruplay_watched_actions: Math.round(di * 0.11),
            metrics_video_p25_watched_actions: Math.round(di * 0.3),
            metrics_video_p50_watched_actions: Math.round(di * 0.19),
            metrics_video_p75_watched_actions: Math.round(di * 0.13),
            metrics_video_p100_watched_actions: Math.round(di * 0.08),
          } : {}),
        }));
      }

      /* actions[] — the long table, with attribution windows */
      for (const a of ACTIONS) {
        const share = a.share ?? c.cvr; // null share → the campaign's conversion rate
        const total = r2(inlineLink * share * (a.valued ? maturity : 1));
        if (total <= 0) continue;
        const val = a.valued ? r2(total * client.aov * (a.valueMult || 1) * (0.9 + rand() * 0.2)) : undefined;
        rows.meta_CampaignActions.push(pick("meta_CampaignActions", {
          ...base, action_type: a.type,
          metrics_actions: total, metrics_actions_default: total,
          metrics_actions_7d_click: r2(total * 0.78), metrics_actions_1d_click: r2(total * 0.62),
          metrics_actions_1d_view: r2(total * 0.16), metrics_actions_28d_click: r2(total * 0.88),
          metrics_unique_actions: r2(total * 0.84),
          metrics_cost_per_action_type: total ? r2(spend / total) : 0,
          ...(val !== undefined ? {
            metrics_action_values: val, metrics_action_values_default: val,
            metrics_action_values_7d_click: r2(val * 0.78), metrics_action_values_1d_click: r2(val * 0.62),
            metrics_action_values_1d_view: r2(val * 0.16), metrics_action_values_28d_click: r2(val * 0.88),
          } : {}),
        }));
      }

      /* placements */
      for (const [pub, pos, devPlat, shareBase] of PLACEMENTS) {
        const share = shareBase * (0.9 + rand() * 0.2);
        const di = Math.round(impressions * share);
        if (!di) continue;
        const dc = Math.round(clicks * share), dsp = r2(spend * share);
        rows.meta_CampaignPlacements.push(pick("meta_CampaignPlacements", {
          ...base, segments_publisher_platform: pub, segments_platform_position: pos,
          segments_device_platform: devPlat, segments_impression_device: devPlat === "desktop" ? "desktop" : "android_smartphone",
          metrics_impressions: di, metrics_reach: Math.round(reach * share), metrics_spend: dsp,
          metrics_clicks: dc, metrics_inline_link_clicks: Math.round(inlineLink * share),
          metrics_ctr: di ? r2((dc / di) * 100) : 0, metrics_cpc: dc ? r2(dsp / dc) : 0,
          metrics_cpm: di ? r2((dsp / di) * 1000) : 0,
          metrics_frequency: frequency,
        }));
      }

      /* age x gender */
      for (const [age, aShare] of AGES) {
        for (const [gender, gShare] of GENDERS) {
          const share = aShare * gShare;
          const di = Math.round(impressions * share);
          if (di < 5) continue;
          const dc = Math.round(clicks * share), dsp = r2(spend * share);
          rows.meta_CampaignDemographics.push(pick("meta_CampaignDemographics", {
            ...base, segments_age: age, segments_gender: gender,
            metrics_impressions: di, metrics_reach: Math.round(reach * share), metrics_spend: dsp,
            metrics_clicks: dc, metrics_inline_link_clicks: Math.round(inlineLink * share),
            metrics_ctr: di ? r2((dc / di) * 100) : 0, metrics_cpc: dc ? r2(dsp / dc) : 0,
            metrics_cpm: di ? r2((dsp / di) * 1000) : 0, metrics_frequency: frequency,
          }));
        }
      }
    }
  }

  for (const [table, list] of Object.entries(rows)) {
    await writeFile(path.join(dir, `${table}.ndjson`), list.map((r) => JSON.stringify(r)).join("\n") + "\n");
    totalRows += list.length;
    console.log(`${ds}.${table}: ${list.length} rows`);
  }
}
console.log(`\n✓ ${totalRows} Meta rows → local-bq/dummy/ (window ${iso(addDays(END, -(DAYS - 1)))} → ${iso(END)})`);
