import type { OpsState, SourceKey, Via, DateRange, Connection, ClientRec, Target, UserRec, Schedule } from "./model";

/* Catalog of connectable sources → which live pipe supplies each */
export const SOURCE_CATALOG: { key: SourceKey; label: string; via: Via; idLabel: string }[] = [
  { key: "ga4", label: "Google Analytics 4", via: "google", idLabel: "Property ID" },
  { key: "googleAds", label: "Google Ads", via: "google", idLabel: "Customer ID" },
  { key: "searchConsole", label: "Search Console", via: "google", idLabel: "Site URL" },
  { key: "gbp", label: "Google Business Profile", via: "google", idLabel: "Location ID" },
  { key: "meta", label: "Meta (Facebook/Instagram)", via: "meta", idLabel: "Ad Account ID" },
  { key: "linkedin", label: "LinkedIn", via: "portal", idLabel: "Org ID" },
  { key: "ghl", label: "GoHighLevel CRM", via: "crm", idLabel: "Location ID" },
  { key: "hubspot", label: "HubSpot CRM", via: "crm", idLabel: "Portal ID" },
  { key: "stripe", label: "Stripe", via: "portal", idLabel: "Account ID" },
  { key: "shopify", label: "Shopify", via: "portal", idLabel: "Store domain" },
  { key: "retailExpress", label: "Retail Express", via: "portal", idLabel: "Site ID" },
  { key: "wildjar", label: "WildJar Call Tracking", via: "portal", idLabel: "Account ID" },
];

export const RANGES: DateRange[] = [
  { key: "7d", label: "Last 7 days", days: 7, factor: 0.24 },
  { key: "30d", label: "Last 30 days", days: 30, factor: 1 },
  { key: "qtd", label: "This quarter", days: 91, factor: 2.9 },
  { key: "ytd", label: "Year to date", days: 212, factor: 6.4 },
];

const MODULE_KEYS = ["campaign", "googleAds", "fbAds", "fbPage", "igOrganic", "linkedin", "ga4", "callTracking", "pipeline", "speedToLead", "showRate", "attribution", "yoy", "ecommerce", "payments", "cohort", "reports"];

/* ---------- random helpers (seeded once, then persisted) ---------- */
const rnd = () => Math.random();
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const ri = (lo: number, hi: number) => Math.floor(rnd() * (hi - lo + 1)) + lo;
const chance = (p: number) => rnd() < p;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const initialsOf = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const NAMES = [
  "Aqua Pulse Spas", "Care For You at Home", "MS Plus", "Coastline Interiors", "BuildRight Homes",
  "Nest & Co", "Verdant Landscapes", "Alfresco Living", "Harbourview Dental", "Peak Physio",
  "Sunny Smiles Ortho", "UrbanEdge Realty", "Pinnacle Property", "Metro Motors", "AutoPro Service",
  "FreshCart Grocers", "Bloom Florals", "Luxe Skincare", "Vitality Gym", "Summit Accounting",
  "BrightPath Tutoring", "EcoClean Services", "PoolPerfect", "Kindle Childcare", "Roam Travel Co",
];
const INDUSTRIES = ["Ecommerce", "Home Services", "Health & Dental", "Real Estate", "Automotive", "Retail", "Professional Services", "Fitness", "Education", "Hospitality", "Non-profit", "Trades", "Beauty & Wellness"];
const MANAGERS = ["Aaron Rodrigo", "Saliya Jayamaha", "Priya Nair", "Tom Becker", "Ava Chen", "Marcus Reid"];
const CURRENCIES = ["AUD", "AUD", "AUD", "AUD", "NZD", "USD"];
const TIMEZONES = ["AEST (UTC+10)", "AEST (UTC+10)", "AWST (UTC+8)", "NZST (UTC+12)", "PST (UTC-8)"];
const PLANS = ["Starter", "Growth", "Scale", "Enterprise"];
const TLDS = [".com.au", ".com.au", ".com", ".co.nz", ".org.au"];
const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f43f5e", "#8b5cf6", "#f59e0b", "#14b8a6", "#22c55e", "#3b82f6", "#ec4899"];
const STATUSES: ClientRec["status"][] = ["active", "active", "active", "active", "active", "active", "paused", "churned"];
const TARGET_POOL = [
  { kpi: "Attributed Revenue", fmt: "$", hi: true, lo: 120000, up: 480000 },
  { kpi: "Blended ROAS", fmt: "x", hi: true, lo: 3, up: 6 },
  { kpi: "Conversions", fmt: "n", hi: true, lo: 300, up: 2400 },
  { kpi: "Cost / Conv.", fmt: "$", hi: false, lo: 30, up: 90 },
  { kpi: "Leads", fmt: "n", hi: true, lo: 120, up: 800 },
  { kpi: "Show Rate", fmt: "%", hi: true, lo: 60, up: 85 },
];

function accountId(source: SourceKey, slug: string): string {
  switch (source) {
    case "ga4": return String(ri(100000000, 999999999));
    case "googleAds": return String(ri(1000000000, 9999999999));
    case "meta": return "act_" + ri(100000000000, 999999999999);
    case "hubspot": return String(ri(1000000, 99999999));
    case "ghl": return "loc_" + slug.replace(/-/g, "").slice(0, 10);
    case "shopify": return slug + ".myshopify.com";
    case "stripe": return "acct_1" + Math.random().toString(36).slice(2, 10);
    case "searchConsole": return "https://" + slug + ".com.au/";
    default: return slug.slice(0, 6) + "-" + ri(10, 99);
  }
}

function genClient(name: string, i: number): { client: ClientRec; subs: string[]; connections: Connection[]; targets: Target[]; user: UserRec } {
  const slug = slugify(name);
  const status = i < 3 ? "active" : pick(STATUSES);
  const client: ClientRec = {
    id: slug, slug, name, initials: initialsOf(name), status,
    plan: pick(PLANS), industry: pick(INDUSTRIES), timezone: pick(TIMEZONES), currency: pick(CURRENCIES),
    website: slug + pick(TLDS), manager: pick(MANAGERS), contact: "hello@" + slug + ".com.au",
    brandColor: pick(COLORS), f: +(0.2 + rnd() * 2.9).toFixed(2),
    aiInsights: i < 3, // opt-in: the 3 canonical demo clients start enabled; others off
  };
  // subscriptions: core always + random extras (speedToLead is core so it's on by default)
  const subs = MODULE_KEYS.filter((k) => ["campaign", "ga4", "reports", "speedToLead"].includes(k) || chance(0.55));
  // connections: ga4 + meta usually connected; others random
  const connections: Connection[] = SOURCE_CATALOG.filter((s) => ["ga4", "meta"].includes(s.key) || chance(0.5)).map((s) => {
    const r = rnd();
    const st: Connection["status"] = r < 0.72 ? "connected" : r < 0.84 ? "error" : r < 0.92 ? "expired" : "disconnected";
    return { source: s.key, accountId: accountId(s.key, slug), status: st, via: s.via, lastSync: st === "connected" ? ri(2, 55) + " min ago" : undefined, error: st === "error" ? "auth / permission failed" : undefined };
  });
  // targets: 2-4 random KPIs
  const shuffled = [...TARGET_POOL].sort(() => rnd() - 0.5).slice(0, ri(2, 4));
  const targets: Target[] = shuffled.map((t) => ({ kpi: t.kpi, value: t.fmt === "x" ? +(t.lo + rnd() * (t.up - t.lo)).toFixed(1) : Math.round(t.lo + rnd() * (t.up - t.lo)), fmt: t.fmt, period: "month", higherIsBetter: t.hi }));
  const schedules: Schedule[] = [{ id: "s-" + slug + "-m", report: "Monthly", cadence: "1st of month", recipients: client.contact, format: "PDF", nextRun: "1 Sep 2026", active: true }];
  if (chance(0.4)) schedules.push({ id: "s-" + slug + "-w", report: "Weekly", cadence: "Every Monday", recipients: client.contact, format: "Link", nextRun: "10 Aug 2026", active: true });
  const user: UserRec = { id: "u-" + slug, email: client.contact, name, role: "client", clientIds: [slug], status: "active" };
  return { client, subs, connections, targets, schedules, user };
}

function seed(): OpsState {
  const clients: ClientRec[] = [];
  const users: UserRec[] = [{ id: "u-admin", email: "hello@entangle.com.au", name: "Entangle Admin", role: "admin", clientIds: [], status: "active" }];
  const subs: Record<string, string[]> = {};
  const connections: Record<string, Connection[]> = {};
  const targets: Record<string, Target[]> = {};
  const schedules: Record<string, Schedule[]> = {};
  NAMES.forEach((name, i) => {
    const g = genClient(name, i);
    clients.push(g.client); users.push(g.user);
    subs[g.client.id] = g.subs; connections[g.client.id] = g.connections; targets[g.client.id] = g.targets; schedules[g.client.id] = g.schedules;
  });
  return { clients, users, subs, connections, targets, schedules, audit: [] };
}

const KEY = "dbm-ops-v5";
export function loadOps(): OpsState {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  const s = seed();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
export function saveOps(o: OpsState) { localStorage.setItem(KEY, JSON.stringify(o)); }
