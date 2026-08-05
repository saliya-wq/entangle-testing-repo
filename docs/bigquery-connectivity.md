# BigQuery Connectivity — Decision Doc

**Status:** draft · **Owner:** Data/Platform · **Context:** replaces the dashboard's
sample data (`src/data.ts`) with live data via BigQuery. Pairs with the provider
seam (`src/lib/provider.ts`) and the derivation layer (`src/lib/metrics.ts`,
`src/lib/attribution.ts`).

The question has two halves and they are independent:

1. **Ingestion** — can each source's data get *into* BigQuery, and how?
2. **Serving** — how does the dashboard *pull* data back *out* of BigQuery?

---

## TL;DR

- **Yes, every source can land in BigQuery** — but only the Google properties have a
  *native* push. Everything else (Meta, Stripe, Shopify, Retail Express, WildJar,
  CRM, LinkedIn) needs an **intermediate connector**: either a managed ELT tool
  (Fivetran / Airbyte / Supermetrics) or a small **custom scheduled loader** that
  reuses the API integrations already living in `entangle-lead-system`.
- **The dashboard never queries BigQuery directly.** It calls the Clerk-gated
  `/api/bq/*` endpoints; the backend runs parameterised **mart** queries with a
  service account, caches the JSON (Neon), and returns **base inputs** — the
  frontend derives every KPI from those via `metrics.ts` / `attribution.ts`.
- **Recommended split:** native BigQuery export for GA4 / Google Ads / Search
  Console; a **custom Cloud Run + Cloud Scheduler loader** for the rest (reuses
  existing creds, lowest cost); dbt/scheduled SQL to build the marts.

---

## Part 1 — Ingestion: getting sources INTO BigQuery

There are three ways a source can reach BigQuery:

| Method | What it is | Best for |
|---|---|---|
| **Native export** | Google's own first-party pipe straight into a BQ dataset | GA4, Google Ads, Search Console |
| **Managed ELT** | A SaaS connector (Fivetran, Airbyte, Stitch, Supermetrics) that reads the source API and writes to BQ on a schedule | Meta, CRM, LinkedIn, Shopify, Stripe — if you want zero maintenance |
| **Custom loader** | A scheduled job (Cloud Run / Cloud Function triggered by Cloud Scheduler) that calls the source API and streams/loads rows into BQ | Anything with an API — reuses the auth already in `entangle-lead-system` |

### Per-source support

| Source | Native BQ? | Recommended route | Notes |
|---|---|---|---|
| **Google Analytics 4** | ✅ Yes | **Native BigQuery Export** (GA4 Admin → BigQuery Links) | Free daily export + optional streaming. Best-quality path. Event-level tables `events_YYYYMMDD`. |
| **Google Ads** | ✅ Yes | **BigQuery Data Transfer Service (DTS)** | Google-managed scheduled transfer. Campaign/ad/keyword tables. |
| **Search Console** | ✅ Yes | **Bulk data export to BigQuery** (native, GSC Settings) | Daily export of URL/query performance. |
| **Google Business Profile** | ⚠️ No | Custom loader (GBP API → BQ) | No native export; small volume. |
| **Meta (Facebook/Instagram Ads)** | ❌ No | Connector **or** custom loader (Graph API `/insights`) | No first-party BQ export. `entangle-lead-system` already has Meta creds + `/api/meta/*` — reuse them in a scheduled loader. |
| **Stripe** | ⚠️ Partial | Custom loader (Stripe API / webhooks) or connector | **Stripe Data Pipeline exports to Snowflake/Redshift only — not BigQuery.** For BQ, use Fivetran/Airbyte or a webhook→BQ loader. |
| **Shopify** | ❌ No | Connector or custom loader (Admin API + webhooks) | Fivetran/Airbyte have solid Shopify connectors; or reuse portal API. |
| **Retail Express** | ❌ No | Custom loader (REST API) | Niche POS — API only, custom is the realistic path. |
| **WildJar (call tracking)** | ❌ No | Custom loader (API + webhooks) | Push call events via webhook → BQ streaming insert for near-real-time. |
| **HubSpot / GoHighLevel (CRM)** | ❌ No | Connector or custom loader | Fivetran/Airbyte have HubSpot connectors; GHL is API/webhook only. |
| **LinkedIn** | ❌ No | Connector (Supermetrics) or custom loader | Marketing API; Supermetrics is common for ad data. |

**Reading of the table:** roughly a third of the sources (the Google stack) push to
BigQuery natively; the rest **must go through a connector**. Since
`entangle-lead-system` already authenticates to Meta / GA4 / Google Ads and exposes
`/api/*` routes, the cheapest and most controllable option for the non-Google
sources is a **custom scheduled loader** that reuses those integrations, rather than
paying per-connector for a managed ELT tool. Managed ELT becomes worth it if the
maintenance burden of many custom loaders outgrows the subscription cost.

### Landing → staging → marts

Whatever the ingestion route, land data in three logical layers inside BigQuery:

```
raw_*        ← exactly as the source/connector delivers it (append-only)
staging_*    ← cleaned, typed, deduped, tagged with client_id
marts_*      ← the tables the dashboard reads (one per module concept)
```

The `marts_*` layer is where the dashboard's needs are met. Build it with **dbt** or
**scheduled queries**. Target marts (names already referenced in
`MODULE_SOURCE` / `provider.ts`):

- `marts_campaign_daily` — spend, impressions, clicks, conversions, revenue by channel/day
- `marts_revenue_reconciliation` — attributed vs closed revenue (Attribution module)
- `marts_retention_cohort` — cohort retention (Cohort & LTV)
- `marts_attribution_paths` — **multi-touch journeys** (feeds `attribution.ts` first/last/linear/decay)
- `marts_ga4_funnel` — sessions → product views → add-to-cart → checkout → conversion
- `marts_ecommerce_daily`, `marts_payments`, `marts_speed_to_lead`, `marts_show_rate`, `marts_yoy`

> **Design rule (important):** marts should expose **base inputs** (spend,
> impressions, clicks, orders, revenue, visitors, funnel counts, COGS, customer
> counts, touchpoint paths) — **not** pre-computed ratios. The frontend already
> derives CVR / ROAS / MER / CPA / cart-abandonment / attribution in `metrics.ts`
> and `attribution.ts`, so keeping ratios out of the mart guarantees the numbers
> reconcile and avoids double-definition.

---

## Part 2 — Serving: pulling data OUT of BigQuery into the dashboard

**The browser must not talk to BigQuery directly** — it would leak credentials, scan
billable bytes per user interaction, and be slow. Data flows through the backend:

```
Dashboard (React)
  → GET/POST /api/bq/<mart>?client_id&start&end&granularity      (Clerk-gated)
    → entangle-lead-system: BigQuery client (service account)
      → parameterised query against marts_* (partitioned + clustered)
      → cache layer (Neon / Redis) keyed by (client, mart, range, granularity)
    ← JSON = base inputs, shaped to the module
  ← provider.ts maps JSON → module shape
  ← metrics.ts / attribution.ts derive KPI cards + charts
```

### How the fetch actually works

1. **API endpoint** — extend the existing `/api/bq/*` handlers (already Clerk-gated
   in `entangle-lead-system`). Each endpoint maps to one mart and accepts
   `client_id`, `start`, `end`, and `granularity`.
2. **Query** — use the `@google-cloud/bigquery` client with a **service account**
   (least-privilege, read-only on the `marts_*` dataset). Always
   **parameterise** (`@client_id`, `@start`, `@end`) — never string-concat.
3. **Cost/latency controls:**
   - **Partition** marts by date, **cluster** by `client_id` → queries scan only the
     relevant slice.
   - Pre-aggregate with **scheduled queries / materialized views** so the API reads
     small summary tables, not raw events.
   - **Cache** results in Neon (or Redis) with a short TTL; the portal already uses
     Neon as a cache, so most dashboard loads never hit BigQuery.
   - Optionally enable **BI Engine** for sub-second aggregate reads.
4. **Response shape** — return base inputs matching what `provider.ts` expects (e.g.
   `{ base: {...}, funnel: [...], channels: [...] }`). Then `metrics.ts` computes the
   cards. Live mode in `provider.ts` already has this seam (`getModuleDataAsync`).

### Multi-tenant isolation

Every mart row carries `client_id`. Enforce isolation with **BigQuery Authorized
Views** (or row-level security) so a service account / query can only ever return one
client's rows, and pass the authenticated user's `client_id` from Clerk — never from
the request body. This mirrors the portal's existing per-client subscription model
(`ops.subs`, `ops.connections`).

---

## Recommended architecture (for Entangle)

```
                 ┌─────────────── NATIVE ───────────────┐
  GA4 ───────────┤ BigQuery Export                       │
  Google Ads ────┤ Data Transfer Service                 ├──► raw_*  ─► staging_* ─► marts_*
  Search Console ┤ Bulk export                            │              (dbt / scheduled SQL)
                 └───────────────────────────────────────┘                     │
                 ┌────────── CUSTOM LOADER ──────────────┐                      │
  Meta ──────────┤ Cloud Scheduler → Cloud Run           │                      │
  Stripe ────────┤ (reuses entangle-lead-system API      ├──► raw_* ────────────┘
  Shopify ───────┤  integrations + creds); webhooks for  │
  Retail Express ┤  WildJar/Stripe near-real-time        │        marts_* (partitioned by date,
  WildJar ───────┤                                       │                clustered by client_id)
  CRM / LinkedIn ┘                                       │                     │
                 └───────────────────────────────────────┘                     ▼
                                                          Dashboard ◄── /api/bq/* ◄── BQ client + Neon cache
```

**Why this split:** native exports are free/managed and best-quality for the Google
stack; a single custom loader service (one Cloud Run app, many source modules) reuses
the auth Entangle already maintains and avoids per-connector SaaS fees. If loader
maintenance grows painful, swap individual sources onto Fivetran/Airbyte later — the
`marts_*` contract to the dashboard doesn't change.

---

## Phased plan (aligned to the mid/end-of-week connectivity target)

1. **Prove the pull path (highest priority):** stand up **one** mart
   (`marts_campaign_daily`) from GA4 + Google Ads native exports, wire `/api/bq/campaign`,
   and flip the Campaign module to live via `provider.ts`. This validates the whole
   serving chain end-to-end with the least ingestion work.
2. **Add native Google exports:** GA4 (funnel + revenue), Search Console.
3. **Stand up the custom loader:** Meta first (creds already present), then
   Stripe/Shopify/WildJar; land into `raw_*`.
4. **Build marts + dbt:** attribution paths, retention cohort, revenue reconciliation.
5. **Caching + isolation hardening:** Neon TTLs, authorized views per `client_id`,
   scheduled-query pre-aggregation.

## Open decisions
- **Build vs buy the connectors** — custom Cloud Run loader (cheaper, more control,
  reuses existing creds) vs Fivetran/Airbyte (faster, less maintenance, per-connector
  cost). Recommendation: **build** for Meta/WildJar/Retail Express (already have auth
  / niche APIs), **consider buy** for HubSpot/Shopify if volume/reliability warrants.
- **Streaming vs batch** — WildJar calls and Stripe events benefit from webhook →
  streaming insert (near-real-time); everything else can be daily batch.
- **BI Engine budget** — enable if aggregate query latency is a UX problem after caching.
