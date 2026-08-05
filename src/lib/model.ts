/* ============================================================
   Operational data model — the real fields a production
   multi-tenant client portal needs (areas 1–7).
   These map to: Entangle CRM, clients.entangle.com.au, Meta,
   Google and BigQuery once the live provider is wired.
   ============================================================ */

/* 2. Users / roles */
export type Role = "admin" | "manager" | "analyst" | "client";
export interface UserRec {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientIds: string[];        // clients this user may access ([] = all, for admins)
  lastLogin?: string;
  mfa?: boolean;
  status?: "active" | "invited" | "disabled";
}

/* 1. Client / account */
export interface ClientRec {
  id: string;
  slug: string;
  name: string;
  initials: string;
  status: "active" | "paused" | "churned";
  plan: string;
  industry: string;
  timezone: string;
  currency: string;           // "AUD" | "USD" ...
  website: string;
  manager: string;            // Entangle account manager
  contact: string;            // client primary contact email
  brandColor: string;         // white-label
  f: number;                  // demo scale factor (removed once live)
}

/* 3. Data-source connection */
export type SourceKey =
  | "ga4" | "googleAds" | "searchConsole" | "gbp"     // via Google
  | "meta"                                            // via Meta
  | "linkedin"                                        // via portal
  | "ghl" | "hubspot"                                 // via Entangle CRM
  | "stripe" | "shopify" | "retailExpress" | "wildjar"; // via portal
export type Via = "crm" | "portal" | "meta" | "google" | "bq";
export type ConnStatus = "connected" | "error" | "expired" | "disconnected";
export interface Connection {
  source: SourceKey;
  accountId: string;          // GA4 property_id, Ads customer_id, Meta act_*, store id, CRM location…
  status: ConnStatus;
  via: Via;                   // which live pipe supplies it
  lastSync?: string;          // ISO timestamp
  error?: string;
  mapping?: Record<string, string>; // UTM fields, CRM pipeline/stage ids, conversion actions
}

/* 4. Goals / targets (drive pacing + KPI scorecard) */
export interface Target {
  kpi: string;
  value: number;
  fmt: string;                // "$" | "x" | "%" | "n"
  period: "month" | "quarter" | "year";
  higherIsBetter: boolean;
}

/* 5. Cross-cutting: date range */
export interface DateRange {
  key: "7d" | "30d" | "qtd" | "ytd" | "custom" | (string & {});
  label: string;
  days: number;
  factor: number;             // demo scaling for the mock provider
  start?: string;             // ISO date (custom ranges only)
  end?: string;               // ISO date (custom ranges only)
}

/* 6. Audit log */
export interface AuditEntry { at: string; who: string; action: string; detail: string }

/* Scheduled report delivery (config; actual send needs a backend cron + email) */
export interface Schedule {
  id: string;
  report: "Weekly" | "Monthly" | "Quarterly" | "KPI Scorecard";
  cadence: "Every Monday" | "1st of month" | "Quarterly";
  recipients: string;   // comma-separated emails
  format: "PDF" | "Link";
  nextRun: string;
  active: boolean;
}

export interface OpsState {
  clients: ClientRec[];
  users: UserRec[];
  subs: Record<string, string[]>;              // clientId -> module keys
  connections: Record<string, Connection[]>;   // clientId -> connections
  targets: Record<string, Target[]>;           // clientId -> targets
  schedules: Record<string, Schedule[]>;       // clientId -> report schedules
  audit: AuditEntry[];
}
