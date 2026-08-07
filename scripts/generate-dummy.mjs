/* ============================================================
   generate-dummy.mjs — realistic Google Ads DTS dummy data.

   Writes NDJSON per client per table to local-bq/dummy/<dataset>/,
   shaped EXACTLY like the DTS schema replica (local-bq/schemas/google_ads).

   Realism modelled:
   - 90 days ending 2026-08-06 (fixed anchor → deterministic output)
   - weekday seasonality (weekend dip) + gentle growth + seeded noise
   - per-channel economics (CTR/CPC/CVR differ by campaign type)
   - device split (mobile/desktop/tablet)
   - CONVERSION LAG: recent days show only partially-matured conversions
     (day-0 ≈ 55% of eventual, day-7+ = 100%) — mirrors DTS restatement
   - DTS bookkeeping: snapshots get one row per entity per _DATA_DATE;
     stats rows carry _DATA_DATE = segments_date; _LATEST_DATE = newest day

   Usage: npm run gen:dummy       (then: npm run bq:seed-local)
   ============================================================ */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "local-bq", "dummy");
const END = new Date("2026-08-06T00:00:00Z"); // fixed anchor (yesterday at design time)
const DAYS = 90;

/* deterministic PRNG (mulberry32) so every run produces identical data */
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
  { slug: "aqua-pulse-spas", name: "Aqua Pulse Spas", customerId: 1234567890, f: 1.0, aov: 900 },
  { slug: "care-for-you-at-home", name: "Care For You at Home", customerId: 2345678901, f: 0.42, aov: 350 },
  { slug: "ms-plus", name: "MS Plus", customerId: 3456789012, f: 1.8, aov: 1400 },
];

/* Campaign portfolio — echoes the dashboard's sample campaigns so the UI reads coherently */
const CAMPAIGNS = [
  { idx: 1, name: "Search — Brand",        channel: "SEARCH",          bidding: "MANUAL_CPC",  imprBase: 1500,  ctr: 0.082, cpc: 1.15, cvr: 0.016, budget: 80 },
  { idx: 2, name: "Search — Non-brand",    channel: "SEARCH",          bidding: "TARGET_CPA",  imprBase: 4200,  ctr: 0.031, cpc: 1.90, cvr: 0.0076, budget: 200 },
  { idx: 3, name: "Performance Max",       channel: "PERFORMANCE_MAX", bidding: "TARGET_ROAS", imprBase: 9000,  ctr: 0.024, cpc: 1.35, cvr: 0.0084, budget: 230 },
  { idx: 4, name: "Shopping",              channel: "SHOPPING",        bidding: "TARGET_ROAS", imprBase: 5200,  ctr: 0.032, cpc: 0.95, cvr: 0.0056, budget: 130 },
  { idx: 5, name: "Display — Remarketing", channel: "DISPLAY",         bidding: "MANUAL_CPC",  imprBase: 16000, ctr: 0.009, cpc: 0.45, cvr: 0.0024, budget: 50, status: "PAUSED" },
];

const DOW = [1.05, 1.09, 1.07, 1.05, 1.0, 0.78, 0.72]; // Mon..Sun
const DEVICES = [["MOBILE", 0.57], ["DESKTOP", 0.37], ["TABLET", 0.06]];
const DOW_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
/* conversion-lag maturity: how much of eventual conversions are visible N days after the click */
const LAG = [0.55, 0.70, 0.80, 0.87, 0.92, 0.95, 0.97];
const lagMaturity = (daysAgo) => (daysAgo >= LAG.length ? 1.0 : LAG[daysAgo]);

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const mondayOf = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));
const firstOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const firstOfQuarter = (d) => new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
const datasetOf = (slug) => "client_" + slug.replace(/-/g, "_");
const round2 = (x) => Math.round(x * 100) / 100;

const CONV_ACTIONS = [
  { n: 101, name: "Purchase", category: "PURCHASE", share: 0.6 },
  { n: 102, name: "Lead form submit", category: "SUBMIT_LEAD_FORM", share: 0.25 },
  { n: 103, name: "Phone call lead", category: "PHONE_CALL_LEAD", share: 0.15 },
];
const ADGROUPS = [
  { sub: 1, suffix: "Core", w: 0.5 },
  { sub: 2, suffix: "Broad", w: 0.3 },
  { sub: 3, suffix: "Longtail", w: 0.2 },
];

let totalRows = 0;
for (const client of CLIENTS) {
  const rand = rng(client.customerId % 100000);
  const ds = datasetOf(client.slug);
  const dir = path.join(OUT, ds);
  await mkdir(dir, { recursive: true });
  const latest = iso(END);
  const rows = { ads_Customer: [], ads_Campaign: [], ads_CampaignBasicStats: [], ads_CampaignStats: [], ads_CampaignConversionStats: [], ads_AdGroup: [], ads_AdGroupBasicStats: [] };

  for (let dayIdx = DAYS - 1; dayIdx >= 0; dayIdx--) {
    const date = addDays(END, -dayIdx);
    const d = iso(date);
    const dowName = DOW_NAMES[date.getUTCDay()];
    const wk = iso(mondayOf(date)), mo = iso(firstOfMonth(date)), qt = iso(firstOfQuarter(date));
    const growth = 1 + 0.25 * ((DAYS - 1 - dayIdx) / (DAYS - 1)); // +25% over the window
    const season = DOW[(date.getUTCDay() + 6) % 7];

    rows.ads_Customer.push({
      customer_auto_tagging_enabled: true, customer_currency_code: "AUD",
      customer_descriptive_name: client.name, customer_id: client.customerId,
      customer_manager: false, customer_test_account: false, customer_time_zone: "Australia/Sydney",
      _DATA_DATE: d, _LATEST_DATE: latest,
    });

    for (const c of CAMPAIGNS) {
      const campaignId = client.customerId % 1000000 * 100 + c.idx;
      const baseRes = `customers/${client.customerId}/campaigns/${campaignId}`;
      const paused = c.status === "PAUSED";

      rows.ads_Campaign.push({
        bidding_strategy_name: c.bidding, campaign_advertising_channel_type: c.channel,
        campaign_bidding_strategy_type: c.bidding,
        campaign_budget_amount_micros: Math.round(c.budget * client.f * 1e6),
        campaign_budget_explicitly_shared: false, campaign_budget_has_recommended_budget: false,
        campaign_budget_period: "DAILY", campaign_campaign_budget: `customers/${client.customerId}/campaignBudgets/${campaignId}`,
        campaign_experiment_type: "BASE", campaign_id: campaignId,
        campaign_manual_cpc_enhanced_cpc_enabled: c.bidding === "MANUAL_CPC",
        campaign_maximize_conversion_value_target_roas: c.bidding === "TARGET_ROAS" ? 4.0 : null,
        campaign_name: c.name, campaign_percent_cpc_enhanced_cpc_enabled: false,
        campaign_serving_status: paused ? "SUSPENDED" : "SERVING", campaign_start_date: "2024-03-01",
        campaign_status: paused ? "PAUSED" : "ENABLED", customer_id: client.customerId,
        _DATA_DATE: d, _LATEST_DATE: latest,
      });

      if (paused && dayIdx < 30) continue; // paused campaign stopped serving 30 days ago

      /* daily campaign totals */
      const noise = 0.85 + rand() * 0.3;
      const impr = Math.round(c.imprBase * client.f * season * growth * noise);
      const clicks = Math.round(impr * c.ctr * (0.9 + rand() * 0.2));
      const cost = clicks * c.cpc * (0.9 + rand() * 0.2);
      const eventualConv = clicks * c.cvr * (0.85 + rand() * 0.3);
      const conv = round2(eventualConv * lagMaturity(dayIdx));       // lag: recent days undercount
      const convValue = round2(conv * client.aov * (0.9 + rand() * 0.2));
      const network = c.channel === "DISPLAY" ? "CONTENT" : c.channel === "SEARCH" ? "SEARCH" : "MIXED";
      const slot = c.channel === "SEARCH" ? "SEARCH_TOP" : "CONTENT";

      /* split across devices → ads_CampaignBasicStats + ads_CampaignStats */
      for (const [device, shareBase] of DEVICES) {
        const share = shareBase * (0.92 + rand() * 0.16);
        const di = Math.round(impr * share), dc = Math.round(clicks * share);
        const dcost = Math.round(cost * share * 1e6);            // micros
        const dconv = round2(conv * share), dcv = round2(convValue * share);
        if (di === 0) continue;
        const common = {
          campaign_base_campaign: baseRes, campaign_id: campaignId, customer_id: client.customerId,
          metrics_clicks: dc, metrics_conversions: dconv, metrics_conversions_value: dcv,
          metrics_cost_micros: dcost, metrics_impressions: di,
          metrics_interaction_event_types: ["CLICK"], metrics_interactions: dc,
          metrics_view_through_conversions: c.channel === "SEARCH" ? 0 : Math.round(dconv * 0.3),
          segments_ad_network_type: network, segments_date: d, segments_device: device,
          _DATA_DATE: d, _LATEST_DATE: latest,
        };
        rows.ads_CampaignBasicStats.push({ ...common, segments_slot: slot });
        /* ads_CampaignStats has NO view_through_conversions or slot column — schemas differ from BasicStats */
        const { metrics_view_through_conversions: _vtc, ...statsCommon } = common;
        rows.ads_CampaignStats.push({
          ...statsCommon,
          metrics_average_cost: dc ? dcost / dc : 0, metrics_average_cpc: dc ? dcost / dc : 0,
          metrics_average_cpm: di ? (dcost / di) * 1000 : 0,
          metrics_conversions_from_interactions_rate: dc ? round2(dconv / dc) : 0,
          metrics_cost_per_conversion: dconv ? dcost / dconv : 0,
          metrics_ctr: di ? round2((dc / di) * 10000) / 100 / 100 : 0,
          metrics_current_model_attributed_conversions: dconv,
          metrics_current_model_attributed_conversions_value: dcv,
          metrics_cost_per_current_model_attributed_conversion: dconv ? dcost / dconv : 0,
          metrics_interaction_rate: di ? round2(dc / di) : 0,
          metrics_value_per_conversion: dconv ? round2(dcv / dconv) : 0,
          metrics_value_per_current_model_attributed_conversion: dconv ? round2(dcv / dconv) : 0,
          metrics_active_view_impressions: c.channel === "DISPLAY" ? Math.round(di * 0.7) : 0,
          metrics_active_view_measurable_impressions: c.channel === "DISPLAY" ? di : 0,
          metrics_active_view_measurable_cost_micros: c.channel === "DISPLAY" ? dcost : 0,
          metrics_active_view_viewability: c.channel === "DISPLAY" ? 0.7 : 0,
          metrics_active_view_measurability: c.channel === "DISPLAY" ? 0.95 : 0,
          metrics_active_view_cpm: 0, metrics_active_view_ctr: 0,
          metrics_gmail_forwards: 0, metrics_gmail_saves: 0, metrics_gmail_secondary_clicks: 0,
          segments_day_of_week: dowName, segments_month: mo, segments_quarter: qt,
          segments_week: wk, segments_year: date.getUTCFullYear(),
        });
      }

      /* conversions split by action → ads_CampaignConversionStats */
      if (conv > 0) {
        for (const a of CONV_ACTIONS) {
          const ac = round2(conv * a.share);
          if (ac <= 0) continue;
          const av = round2(convValue * a.share);
          rows.ads_CampaignConversionStats.push({
            campaign_base_campaign: baseRes, campaign_id: campaignId, customer_id: client.customerId,
            metrics_conversions: ac, metrics_conversions_value: av,
            metrics_value_per_conversion: ac ? round2(av / ac) : 0,
            segments_ad_network_type: network,
            segments_conversion_action: `customers/${client.customerId}/conversionActions/${a.n}`,
            segments_conversion_action_category: a.category, segments_conversion_action_name: a.name,
            segments_conversion_attribution_event_type: "INTERACTION",
            segments_date: d, segments_day_of_week: dowName, segments_month: mo,
            segments_quarter: qt, segments_slot: slot, segments_week: wk, segments_year: date.getUTCFullYear(),
            _DATA_DATE: d, _LATEST_DATE: latest,
          });
        }
      }

      /* ad groups: snapshot + stats split */
      for (const ag of ADGROUPS) {
        const agId = campaignId * 10 + ag.sub;
        rows.ads_AdGroup.push({
          ad_group_ad_rotation_mode: "OPTIMIZE", ad_group_cpc_bid_micros: Math.round(c.cpc * 1e6),
          ad_group_id: agId, ad_group_name: `${c.name} — ${ag.suffix}`,
          ad_group_status: "ENABLED", ad_group_type: c.channel === "DISPLAY" ? "DISPLAY_STANDARD" : "SEARCH_STANDARD",
          campaign_bidding_strategy_type: c.bidding, campaign_id: campaignId,
          campaign_manual_cpc_enhanced_cpc_enabled: c.bidding === "MANUAL_CPC",
          campaign_percent_cpc_enhanced_cpc_enabled: false, customer_id: client.customerId,
          _DATA_DATE: d, _LATEST_DATE: latest,
        });
        for (const [device, shareBase] of DEVICES) {
          const w = ag.w * shareBase;
          const di = Math.round(impr * w);
          if (di === 0) continue;
          const dc = Math.round(clicks * w);
          rows.ads_AdGroupBasicStats.push({
            ad_group_base_ad_group: `customers/${client.customerId}/adGroups/${agId}`, ad_group_id: agId,
            campaign_base_campaign: baseRes, campaign_id: campaignId, customer_id: client.customerId,
            metrics_clicks: dc, metrics_conversions: round2(conv * w), metrics_conversions_value: round2(convValue * w),
            metrics_cost_micros: Math.round(cost * w * 1e6), metrics_impressions: di,
            metrics_interaction_event_types: ["CLICK"], metrics_interactions: dc,
            metrics_view_through_conversions: 0,
            segments_ad_network_type: network, segments_date: d, segments_device: device, segments_slot: slot,
            _DATA_DATE: d, _LATEST_DATE: latest,
          });
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
console.log(`\n✓ ${totalRows} total rows → local-bq/dummy/ (deterministic; window ${iso(addDays(END, -(DAYS - 1)))} → ${iso(END)})`);
