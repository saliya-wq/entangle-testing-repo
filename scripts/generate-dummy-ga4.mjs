/* ============================================================
   generate-dummy-ga4.mjs — event-level GA4 dummy data, shaped to
   Google's own BigQuery Export schema (local-bq/schemas/ga4).

   Structure is fully faithful: one row per EVENT, with the nested
   records that make GA4 GA4 — event_params[], items[], device.web_info,
   geo, traffic_source, collected_traffic_source (gclid), the
   session_traffic_source_last_click campaign records, and ecommerce.

   Session funnel per visit:
     session_start → page_view(s) → [view_item] → [add_to_cart]
       → [begin_checkout] → [purchase]
   Channel mix includes paid rows attributed to the SAME Google Ads and
   Meta campaigns that live in the ads and meta tables, so cross-channel
   stories line up.

   VOLUME — read this: event-level data does not scale like the daily ad
   tables. Reconciling to true click volume would be ~1.3M events per
   client for 90 days, which is impractical for a local emulator (and
   pointless for validating SQL). Sessions here are therefore modelled at
   a deliberately modest, DOCUMENTED scale: the shapes and query idioms
   are exact, the absolute session counts are indicative and will NOT tie
   out to the ad platforms' click counts. Real export volume is whatever
   Google sends — the SQL doesn't change.

   Usage: npm run gen:dummy:ga4
   ============================================================ */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "local-bq", "dummy");
const END = new Date("2026-08-06T00:00:00Z");
const DAYS = 90;
const SESSIONS_PER_DAY = 25; // indicative scale — see the volume note above

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
  { slug: "aqua-pulse-spas", name: "Aqua Pulse Spas", stream: "1234567", host: "aquapulsespas.com.au", f: 1.0, aov: 900,
    items: [["SPA-AUR-60", "Aurora Swim Spa 6.0", "Swim Spas", 15000], ["SPA-PLG-PRO", "Plunge Pro Compact", "Plunge Pools", 6000], ["SPA-HYD-5", "Hydro Hot Tub 5-seat", "Hot Tubs", 4200], ["ACC-COV-KIT", "Cover & Cushion Kit", "Accessories", 70]] },
  { slug: "care-for-you-at-home", name: "Care For You at Home", stream: "2345678", host: "careforyouathome.com.au", f: 0.42, aov: 350,
    items: [["CARE-HOME-STD", "Home Care Package", "Services", 350], ["CARE-RESP", "Respite Care Day", "Services", 210]] },
  { slug: "ms-plus", name: "MS Plus", stream: "3456789", host: "msplus.com.au", f: 1.8, aov: 1400,
    items: [["MSP-PROG-A", "Support Program A", "Programs", 1400], ["MSP-EQUIP", "Mobility Equipment", "Equipment", 900]] },
];

/* Channel mix — paid rows carry the real campaign identities from the ads and meta tables */
const CHANNELS = [
  { w: 0.32, source: "google", medium: "organic", name: null, paid: null },
  { w: 0.20, source: "google", medium: "cpc", name: "Search — Non-brand", paid: "google", campaignIdx: 2 },
  { w: 0.08, source: "google", medium: "cpc", name: "Performance Max", paid: "google", campaignIdx: 3 },
  { w: 0.14, source: "facebook", medium: "paid_social", name: "Summer Lookbook", paid: "meta", campaignIdx: 1 },
  { w: 0.06, source: "instagram", medium: "paid_social", name: "UGC Video — Rattan", paid: "meta", campaignIdx: 2 },
  { w: 0.13, source: "(direct)", medium: "(none)", name: null, paid: null },
  { w: 0.05, source: "bing", medium: "organic", name: null, paid: null },
  { w: 0.02, source: "newsletter", medium: "email", name: "August EDM", paid: null },
];
const DEVICES = [
  { cat: "mobile", brand: "Apple", model: "iPhone", os: "iOS", osv: "18.2", browser: "Safari", bv: "18.2", w: 0.38 },
  { cat: "mobile", brand: "Samsung", model: "Galaxy S24", os: "Android", osv: "15", browser: "Chrome", bv: "131.0", w: 0.22 },
  { cat: "desktop", brand: "", model: "", os: "Macintosh", osv: "14.6", browser: "Chrome", bv: "131.0", w: 0.21 },
  { cat: "desktop", brand: "", model: "", os: "Windows", osv: "10", browser: "Edge", bv: "131.0", w: 0.13 },
  { cat: "tablet", brand: "Apple", model: "iPad", os: "iOS", osv: "18.1", browser: "Safari", bv: "18.1", w: 0.06 },
];
const GEOS = [
  ["Queensland", "Brisbane", 0.30], ["New South Wales", "Sydney", 0.28], ["Victoria", "Melbourne", 0.22],
  ["Western Australia", "Perth", 0.10], ["South Australia", "Adelaide", 0.10],
];
const PAGES = ["/", "/spa-range", "/swim-spas", "/plunge-pools", "/book-a-consult", "/about", "/contact"];
const DOW = [1.05, 1.08, 1.06, 1.04, 1.0, 0.80, 0.75];

const iso = (d) => d.toISOString().slice(0, 10);
const ymd = (d) => iso(d).replace(/-/g, "");
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const datasetOf = (slug) => "client_" + slug.replace(/-/g, "_");
const r2 = (x) => Math.round(x * 100) / 100;
const pickW = (list, r, key = "w") => { let a = 0; const t = list.reduce((s, x) => s + (x[key] ?? x[2]), 0); const p = r * t;
  for (const x of list) { a += (x[key] ?? x[2]); if (p <= a) return x; } return list[list.length - 1]; };

/* event_params helpers — the nested key/value shape GA4 uses */
const sp = (key, string_value) => ({ key, value: { string_value } });
const ip = (key, int_value) => ({ key, value: { int_value } });
const dp = (key, double_value) => ({ key, value: { double_value } });

let totalRows = 0;
for (const client of CLIENTS) {
  const rand = rng(parseInt(client.stream, 10) % 100000);
  const ds = datasetOf(client.slug);
  const dir = path.join(OUT, ds);
  await mkdir(dir, { recursive: true });
  const events = [];

  for (let dayIdx = DAYS - 1; dayIdx >= 0; dayIdx--) {
    const date = addDays(END, -dayIdx);
    const eventDate = ymd(date);
    const dayStartUs = date.getTime() * 1000;
    const season = DOW[(date.getUTCDay() + 6) % 7];
    const growth = 1 + 0.2 * ((DAYS - 1 - dayIdx) / (DAYS - 1));
    const sessions = Math.round(SESSIONS_PER_DAY * client.f * season * growth * (0.9 + rand() * 0.2));

    for (let s = 0; s < sessions; s++) {
      const ch = pickW(CHANNELS, rand());
      const dev = pickW(DEVICES, rand());
      const [region, city] = pickW(GEOS, rand());
      const pseudoId = `${1000000 + Math.floor(rand() * 900000)}.${1700000000 + Math.floor(rand() * 99999999)}`;
      const sessionId = 1750000000 + Math.floor(rand() * 90000000);
      let ts = dayStartUs + Math.floor(rand() * 86400) * 1000000;
      const engaged = rand() < 0.62;

      /* shared per-event scaffolding */
      const scaffold = () => ({
        event_date: eventDate, event_timestamp: ts, stream_id: client.stream, platform: "WEB",
        user_pseudo_id: pseudoId, user_first_touch_timestamp: ts - Math.floor(rand() * 30) * 86400000000,
        privacy_info: { analytics_storage: "Yes", ads_storage: ch.paid ? "Yes" : "No", uses_transient_token: "No" },
        device: {
          category: dev.cat, mobile_brand_name: dev.brand, mobile_model_name: dev.model,
          operating_system: dev.os, operating_system_version: dev.osv, language: "en-au",
          is_limited_ad_tracking: "No", time_zone_offset_seconds: 36000,
          web_info: { browser: dev.browser, browser_version: dev.bv, hostname: client.host },
        },
        geo: { continent: "Oceania", sub_continent: "Australasia", country: "Australia", region, city, metro: "(not set)" },
        traffic_source: { name: ch.name || "(direct)", medium: ch.medium, source: ch.source },
        collected_traffic_source: {
          manual_campaign_name: ch.paid === "meta" ? ch.name : null,
          manual_source: ch.paid === "meta" ? ch.source : null,
          manual_medium: ch.paid === "meta" ? ch.medium : null,
          gclid: ch.paid === "google" ? `Cj0KCQ${Math.floor(rand() * 1e12).toString(36)}` : null,
        },
        session_traffic_source_last_click: ch.paid === "google"
          ? { google_ads_campaign: { customer_id: "1234567890", account_name: client.name, campaign_id: String(100 + ch.campaignIdx), campaign_name: ch.name, ad_group_name: "Core" } }
          : ch.paid === "meta"
            ? { cross_channel_campaign: { campaign_id: String(2385000 + ch.campaignIdx), campaign_name: ch.name, source: ch.source, medium: ch.medium, source_platform: "Manual" } }
            : { manual_campaign: { campaign_name: ch.name || "(organic)", source: ch.source, medium: ch.medium } },
        event_dimensions: { hostname: client.host },
      });
      const baseParams = () => [
        ip("ga_session_id", sessionId), ip("ga_session_number", 1 + Math.floor(rand() * 3)),
        sp("session_engaged", engaged ? "1" : "0"), sp("page_location", `https://${client.host}`),
        sp("page_referrer", ch.medium === "organic" ? `https://www.${ch.source}.com/` : ""),
      ];

      /* 1. session_start */
      events.push({ ...scaffold(), event_name: "session_start", is_active_user: true, event_params: baseParams() });

      /* 2. page_views */
      const views = engaged ? 2 + Math.floor(rand() * 4) : 1;
      for (let v = 0; v < views; v++) {
        ts += Math.floor(15000000 + rand() * 90000000);
        const page = PAGES[Math.floor(rand() * PAGES.length)];
        events.push({
          ...scaffold(), event_name: "page_view", is_active_user: true,
          event_params: [
            ...baseParams(),
            sp("page_location", `https://${client.host}${page}`), sp("page_title", `${client.name} — ${page}`),
            ip("engagement_time_msec", Math.floor(5000 + rand() * 120000)),
            sp("page_path", page),
          ],
        });
      }

      /* 3. ecommerce funnel (only engaged sessions progress) */
      if (engaged && rand() < 0.34) {
        const [id, name, cat, price] = client.items[Math.floor(rand() * client.items.length)];
        const item = { item_id: id, item_name: name, item_category: cat, item_brand: client.name, price, quantity: 1, item_revenue: price };
        const stage = (evName, extraParams = [], ecom = null, its = [item]) => {
          ts += Math.floor(20000000 + rand() * 60000000);
          events.push({ ...scaffold(), event_name: evName, is_active_user: true,
            event_params: [...baseParams(), ...extraParams, ip("engagement_time_msec", Math.floor(8000 + rand() * 60000))],
            items: its, ...(ecom ? { ecommerce: ecom } : {}) });
        };
        stage("view_item", [dp("value", price), sp("currency", "AUD")]);
        if (rand() < 0.45) {
          stage("add_to_cart", [dp("value", price), sp("currency", "AUD")]);
          if (rand() < 0.42) {
            stage("begin_checkout", [dp("value", price), sp("currency", "AUD")]);
            if (rand() < 0.38) {
              const txnId = `T-${eventDate}-${Math.floor(rand() * 100000)}`;
              const shipping = r2(price * 0.03), tax = r2(price * 0.1);
              stage("purchase",
                [dp("value", price), sp("currency", "AUD"), sp("transaction_id", txnId)],
                { transaction_id: txnId, purchase_revenue: price, purchase_revenue_in_usd: r2(price * 0.66),
                  total_item_quantity: 1, unique_items: 1, shipping_value: shipping, tax_value: tax });
            }
          }
        }
      }

      /* 4. a lead-style key event on some non-purchase sessions */
      if (engaged && rand() < 0.09) {
        ts += Math.floor(20000000 + rand() * 40000000);
        events.push({ ...scaffold(), event_name: "generate_lead", is_active_user: true,
          event_params: [...baseParams(), sp("form_name", "Book a consult"), dp("value", 0)] });
      }
    }
  }

  await writeFile(path.join(dir, "ga4_events.ndjson"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  totalRows += events.length;
  console.log(`${ds}.ga4_events: ${events.length} events`);
}
console.log(`\n✓ ${totalRows} GA4 events → local-bq/dummy/ (window ${iso(addDays(END, -(DAYS - 1)))} → ${iso(END)})`);
console.log(`  NOTE: sessions modelled at an indicative scale (${SESSIONS_PER_DAY}/day base) — structure is exact, volume does not tie to ad clicks.`);
