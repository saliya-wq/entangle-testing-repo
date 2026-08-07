/* ============================================================
   Data provider — the ONE seam between the UI and the data.
   - mock: sample data scaled by client × range.
   - live: real headline KPIs from Meta / GA4 / Google via the
     /api endpoints (clients.entangle.com.au), using each
     client's connected account IDs; charts stay sample until
     the marts are mapped. Falls back to sample on any error.

   Live routing (by connection `via`):
     crm    → Entangle CRM (HubSpot/GHL)
     portal → clients.entangle.com.au /api (Stripe, Shopify, Retail Express, WildJar, LinkedIn)
     meta   → Meta Graph (/api/meta/*)
     google → Google Ads + GA4 + GSC + GBP (/api/google/*, /api/ga4/*)
     bq     → BigQuery marts (/api/bq/*)
   ============================================================ */
import { DATA } from "@/data";
import type { ClientRec, DateRange, Connection } from "./model";

/** Where live calls go. base "" = same-origin /api (works behind the ELS proxy);
    set to https://clients.entangle.com.au to hit prod (needs CORS/auth). */
export const liveConfig = { base: "" };

export const MODULE_SOURCE: Record<string, string> = {
  campaign: "google + meta + bq", googleAds: "google", fbAds: "meta", fbPage: "meta", igOrganic: "meta", linkedin: "portal",
  ga4: "google", callTracking: "portal (WildJar) + crm", pipeline: "crm", speedToLead: "crm + bq", showRate: "crm + bq",
  attribution: "bq (revenue_reconciliation)", yoy: "bq + portal", ecommerce: "portal (Shopify/Retail Express)",
  payments: "portal (Stripe)", cohort: "bq (retention_cohort)", reports: "bq + crm", linkedin2: "",
};

export interface ModuleResult { mod: string; d: any; f: number; freshness: string; source: string; live: boolean }

function mock(client: ClientRec, moduleKey: string, range: DateRange): ModuleResult {
  return { mod: moduleKey, d: DATA[moduleKey], f: client.f * range.factor, freshness: "sample data", source: MODULE_SOURCE[moduleKey] || "—", live: false };
}

async function post(path: string, body: unknown): Promise<any> {
  const r = await fetch(liveConfig.base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("api " + r.status);
  return r.json();
}

/** Live headline KPIs (real numbers) for the modules we've mapped; charts remain sample. */
async function liveKpis(moduleKey: string, range: DateRange, conns: Connection[]): Promise<any[] | null> {
  const acc = (src: string) => conns.find((c) => c.source === src && c.status === "connected")?.accountId;
  if (moduleKey === "fbAds") {
    const id = acc("meta"); if (!id) return null;
    const a = (await post("/api/meta/snapshot", { account_id: id, days: range.days })).snapshot?.account_insights; if (!a) return null;
    const roas = a.spend ? +((a.purchase_value || 0) / a.spend).toFixed(1) : 0;
    return [
      { l: "Amount Spent", v: a.spend, fmt: "$", hero: true }, { l: "Reach / Impr.", v: a.impressions, fmt: "c" },
      { l: "Link Clicks", v: a.link_clicks || a.clicks, fmt: "n" }, { l: "Leads", v: a.leads, fmt: "n" },
      { l: "CTR", v: a.ctr_pct, fmt: "%", rate: true }, { l: "ROAS", v: roas, fmt: "x", rate: true },
    ];
  }
  if (moduleKey === "ga4") {
    const id = acc("ga4"); if (!id) return null;
    const s = (await post("/api/ga4/snapshot", { property_id: id, days: range.days })).snapshot; if (!s) return null;
    let sess = 0, users = 0, conv = 0;
    (s.report?.rows || []).forEach((r: any) => { const [a, b, c] = r.metricValues.map((v: any) => +v.value); sess += a; users += b; conv += c; });
    return [
      { l: "Users", v: users, fmt: "c", hero: true }, { l: "Sessions", v: sess, fmt: "c" },
      { l: "Conversions", v: conv, fmt: "n" }, { l: "Ecom. Revenue", v: s.ecommerce?.revenue || 0, fmt: "$" },
    ];
  }
  if (moduleKey === "googleAds") {
    const id = acc("googleAds"); if (!id) return null;
    const r = await post("/api/google/snapshot", { customer_id: id, days: range.days }); if (r.error || !r.snapshot) return null;
    const m = r.snapshot.metrics;
    return [
      { l: "Cost", v: m.cost, fmt: "$", hero: true }, { l: "Impressions", v: m.impressions, fmt: "c" },
      { l: "Clicks", v: m.clicks, fmt: "n" }, { l: "Conversions", v: m.conversions, fmt: "n" },
    ];
  }
  return null;
}

/** BigQuery marts overlay. Two backends share this seam:
    - demo /api/bq (Vercel): returns BASE kpis → caller scales by client × range factor
    - local dev-api → emulator marts: returns REAL windowed data (real_window: true) → f must stay 1
    Returns null if BQ isn't configured/reachable or has no rows for this client+module. */
const OVERLAY_KEYS = ["kpis", "paths", "campaigns", "devices", "base", "mix", "channels", "trend"] as const;
async function liveBq(moduleKey: string, clientSlug: string, rangeKey: string): Promise<{ overlay: any; realWindow: boolean } | null> {
  try {
    const r = await fetch(liveConfig.base + `/api/bq/${moduleKey}?client=${encodeURIComponent(clientSlug)}&range=${encodeURIComponent(rangeKey)}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data?.kpis) || !data.kpis.length) return null;
    const overlay: any = {};
    for (const k of OVERLAY_KEYS) if (data[k] != null) overlay[k] = data[k];
    return { overlay, realWindow: !!data.real_window };
  } catch {
    return null;
  }
}

/** Async entry point used by the UI. */
export async function getModuleDataAsync(client: ClientRec, moduleKey: string, range: DateRange, live: boolean, conns: Connection[]): Promise<ModuleResult> {
  if (live) {
    // 1. BigQuery marts. real_window data is already aggregated for the selected
    //    range (f = 1); demo base data is scaled by the client × range factor.
    const bq = await liveBq(moduleKey, client.slug, range.key);
    if (bq) {
      const f = bq.realWindow ? 1 : client.f * range.factor;
      const freshness = bq.realWindow ? "LIVE · BigQuery mart" : "LIVE · BigQuery";
      return { mod: moduleKey, d: { ...DATA[moduleKey], ...bq.overlay }, f, freshness, source: "bq", live: true };
    }
    // 2. Platform snapshot KPIs (Meta / GA4 / Google) for the mapped modules.
    try {
      const kpis = await liveKpis(moduleKey, range, conns);
      if (kpis) return { mod: moduleKey, d: { ...DATA[moduleKey], kpis }, f: 1, freshness: "LIVE · just now", source: MODULE_SOURCE[moduleKey] || "—", live: true };
      return { ...mock(client, moduleKey, range), freshness: "sample (live not mapped for this module)" };
    } catch {
      return { ...mock(client, moduleKey, range), freshness: "sample (live source unreachable)" };
    }
  }
  return mock(client, moduleKey, range);
}
