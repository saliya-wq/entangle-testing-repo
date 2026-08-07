# Entangle Client Portal — Changelog

Dashboard-mockup (Vite / React / TypeScript). Live: https://entangle-testing-repo.vercel.app
The footer `VERSION` constant in `src/App.tsx` is the source of truth; pushing to `main` auto-deploys via Vercel.

---

## V1.0.0 — Initial build
The full app in one commit: single-page client portal with Recharts + shadcn/ui, a 17-module multi-tenant dashboard, admin + client roles, 25 seeded clients, selectable themes, PDF export, report schedules, and a `provider.ts` seam for live data. All sample data.

## V1.0.1 — Blank-screen fix + version stamp
- **Bug fix:** switching sidebar modules blanked the screen. Cause — on a module switch the new view rendered against the *previous* module's data (different shape), threw, and React unmounted the whole tree. Fix — tag `ModuleResult` with its `mod` and only render a view when the loaded result matches the current module (show `Loading…` otherwise).
- Added the footer `VERSION` stamp (original release = V1.0.0).

## V1.0.2 — Auto-hide sidebar
Sidebar slides off-screen by default and reveals on left-edge hover as an overlay; a header **☰** button and a sidebar **pin** toggle keep it open (reserving 264px). Main content goes full-width when unpinned.

## V1.0.3 — Date picker + comparison
- New `DateRangePicker`: quick presets (last 7/30 days, quarter, YTD), a **custom start/end range**, and a **compare-to** selector (previous period / previous year), surfaced in the header.
- Made **Speed-to-Lead a default-on core module** (seed key → `dbm-ops-v4`).

## V1.0.4 — Metrics derivation layer
- New `src/lib/metrics.ts`: pure formula library — CVR, AOV, ROAS/MER, CPC/CPM/CPA, CAC, revenue-per-visitor, gross margin, BEROAS, cart-abandonment, add-to-cart, retention / returning / churn / refund rates — plus a `kpi()` builder that computes each card's value **and** its period-over-period delta from base inputs.
- **Refactor:** Campaign, GA4, and Ecommerce KPI cards now **derive from base inputs**, so a card can never disagree with the table/chart beneath it (e.g. Campaign spend/conv/revenue equal the channel-table sums). Added CPM/CPC to the Ads modules.

## V1.0.5 — Attribution models
New `src/lib/attribution.ts` engine — **first-click, last-click, linear, time-decay** (7-day half-life) over synthetic multi-touch conversion paths (engineered to sum to exactly 195 conversions / \$177,584, matching the module headline). New "Attribution Models" tab: model switcher, per-model channel economics, a model-comparison table, and the conversion-path journeys.

## V1.0.6 — Chart granularity toggle
New `src/lib/timeseries.ts` (deterministic resampling) + a `GranularityCtx` consumed by the charts. A header **D / W / M / Q / Y** control reshapes every trend chart at once (categorical bar charts untouched). Weekly is a pass-through, preserving the original look.

## V1.0.7 — CPM/CPC fix + KPI grid balancing
*(found during the live visual design pass)*
- **Bug fix:** CPM (and Meta CPC) were being scaled by the client factor — Google CPM showed \$53 instead of \$44.68. Marked them `rate: true` so ratios aren't multiplied.
- **Layout:** balanced the KPI grid — 8-card modules render **4+4** and the 9-card Google Ads module **5+4**, instead of a half-empty `6+2 / 6+3` row.

## V1.0.8 — AI Insights via real Claude (server-side)
New `api/insights.ts` Vercel serverless function using the official `@anthropic-ai/sdk`, model **`claude-opus-4-8`**, structured JSON output, with the **API key kept server-side only**. The frontend renders the deterministic rules insights instantly, then upgrades to Claude in the background, and **falls back to rules on any error**. `vercel.json` rewrite updated to exclude `/api/*`.

## V1.0.9 — In-memory insights cache
Session-level cache keyed by `module | client | range | live` — revisiting a module returns the cached Claude insights instantly with no repeat API call (saving latency and tokens). Only successful results are cached.

## V1.0.10 — Per-client AI opt-in toggle
New `ClientRec.aiInsights` flag + an admin toggle in **Admin → Client Settings**, so only opted-in clients use the Claude agent; others get the rules engine. The Portal gates the `/api/insights` call on the flag. Seeded on for the 3 canonical demo clients (seed key → `dbm-ops-v5`).

## V1.0.11 — Header AI status indicator
Read-only **`✨ AI on` / `AI off`** badge in the client-facing header reflecting the opt-in, so the AI status is visible without opening the admin panel.

## V1.0.12 — Hide banner when AI is off
When a client's AI toggle is off, the **AI Insights banner is now hidden entirely** (previously it still showed rules-based insights). The header on/off indicator still shows the status.

## V1.0.13 — Demo data → BigQuery, and read it back
- **Push** (`npm run seed:bq` → `npm run load:bq`, both no-CLI Node scripts): loads the sample data into **per-client `demo_client_<slug>` datasets** (ISO 27001 dataset-per-tenant isolation), labeled `env=demo` with an `is_demo` column on every row — so the demo footprint is triple-tagged and removable in one command. This is a BigQuery **load job**, not Data Transfer Service.
- **Read back:** `api/bq/[module].ts` (allowlist-gated, service-account via base64 `GCP_SA_KEY`, parameterised query) → `provider.ts` overlays BigQuery KPIs/paths onto the module when **Live** is on, falling back to sample when unconfigured.
- Now running end-to-end against the real `entangle-signals` project.

## V1.0.14 — Reconcile Live vs sample values *(current)*
The 3 canonical demo clients now use **fixed** scale factors (Aqua Pulse 1, Care For You 0.42, MS Plus 1.8) instead of random, matching the BigQuery seed. So toggling **Live** at the default 30-day range now switches only the *source*, not the numbers — Live (BigQuery) and sample reconcile. (On other date ranges, sample still scales by the range factor while Live stays at the single BQ snapshot — expected, since only one snapshot was loaded.) Seed key → `dbm-ops-v6`.

---

### Notes
- **Bug fixes:** V1.0.1 (blank screen) and V1.0.7 (CPM/CPC scaling). Everything else is feature work or refactors.
- **Seed-key bumps** (re-seed browser `localStorage`): `dbm-ops-v3` (original) → `v4` (speed-to-lead default-on, V1.0.3) → `v5` (aiInsights field, V1.0.10) → `v6` (fixed demo-client factors, V1.0.14).
- **Pending action:** set `ANTHROPIC_API_KEY` in the Vercel project environment so opted-in clients get live Claude output; until then they gracefully show the `rules` fallback.
