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

## V1.0.14 — Reconcile Live vs sample values
The 3 canonical demo clients now use **fixed** scale factors (Aqua Pulse 1, Care For You 0.42, MS Plus 1.8) instead of random, matching the BigQuery seed. So toggling **Live** at the default 30-day range now switches only the *source*, not the numbers — Live (BigQuery) and sample reconcile.

## V1.0.15 — Range-aware Live data
BigQuery now holds a **`range_key` dimension** — every KPI (and attribution path) is seeded once per date range (7d/30d/quarter/YTD), values `base × client.f × range.factor`. The `/api/bq` function filters `WHERE range_key = @range` and `provider.ts` passes the selected range. So changing the **date picker now updates the numbers in Live mode**, and Live matches sample on **every** range (not just 30d). BigQuery re-loaded (1,260 KPI rows + 144 path rows across the 3 demo datasets).

## V1.0.16 — Granularity tooltips + visible daily detail
- **Tooltips:** the header D/W/M/Q/Y buttons now show proper hover labels (Daily/Weekly/Monthly/Quarterly/Annually) instead of the slow native `title`.
- **Visible effect:** granularity previously only relabelled the x-axis — `resample()` interpolates, which preserves the line's shape, so coarser views looked identical. The **Daily** view now applies a deterministic weekday-seasonality pattern (weekend dips) so fine granularity is visibly detailed vs. the smooth coarser views.

## V1.0.25 — Organic social: LinkedIn, Facebook Page, Instagram — the platform set is complete *(current)*
The last three platforms, in one pass: **12 tables / 424 columns** across `facebook_page`, `instagram` and `linkedin` (each: entity snapshot, daily stats, per-post, audience) — **137 tables per client dataset**, 118,520 rows, **7 marts per client**. Modules wired: **Facebook Page** (46,989 followers, +1,237 net, 4.71% engagement), **Instagram** (29,185 followers, follower vs non-follower reach split, Reels), **LinkedIn** (3,674 followers with the seniority/industry/function/company-size breakdowns that are its real value).

Deprecated metrics deliberately excluded and documented: Meta's 2024 Page Insights pruning, and Instagram's `impressions` → `views` migration — modelling dead metrics would produce tables that can never be filled.

**All 7 platforms now serve from per-client BigQuery marts.**

## V1.0.24 — Call tracking on BigQuery
Fourth platform. **3 call-tracking tables / 239 columns** designed from the WildJar + CallRail APIs (no native BQ export — our shapes): `calls_Call` (**one row per call** — 162 columns of identity, routing, a 63-field attribution block, and outcome/quality incl. transcript, sentiment, tags, qualification), `calls_TrackingNumber` (daily pool snapshot, so calls join to their number's configured source) and `calls_DailyStats`. 6,573 dummy rows with business-hours weighting, dispositions, and a tracking-number pool whose numbers map to the **same Google/Meta campaigns** as the other platforms. `fact_calls_daily` + the **Call Tracking** module (416 calls · 303 answered · 15.6% miss rate · 131 qualified, by source, plus the individual recent calls).

**Mutability modelled properly:** unlike ad stats, call records keep changing after the call — tags, disposition, qualification and transcription land later. The generator reflects that (recent calls are legitimately un-enriched and show "Pending"), and the docs specify **MERGE on call id over a trailing window**, never blind-append. `calls_Call` is a mutable fact, so the `_DATA_DATE = _LATEST_DATE` snapshot filter must never be applied to it.

## V1.0.23 — GA4 event-level data on BigQuery
Third platform, and the structurally hardest: GA4's **native BigQuery Export schema replicated exactly** — 30 top-level fields, **190 leaf fields, 4 levels of nesting** (`event_params[]`, `items[]` with `item_params[]`, `device.web_info`, `session_traffic_source_last_click` with its six campaign records, `ecommerce`). Event-level dummy data (30,791 events: `session_start → page_view → view_item → add_to_cart → begin_checkout → purchase`, paid sessions attributed to the same Google/Meta campaigns). `fact_ga4_daily` derives sessions/users/engagement/funnel/revenue with the **real GA4 `UNNEST(event_params)` idiom**, and the **Web Analytics** module now reads it — real funnel (846 → 170 → 70 → 27 → 9), channel groups, device mix.

**Emulator boundary found:** the local emulator creates and stores nested RECORDs fine but **cannot execute the `UNNEST` scalar-subquery idiom** (it translates to SQLite and fails on struct conversion). The SQL is valid — it builds on real BigQuery. `bq:transform` now warns and skips that mart locally instead of failing the run, so GA4 is validated against real BQ while the other marts still build offline.

## V1.0.22 — Meta (Facebook/Instagram) Ads on BigQuery + blended Campaign
Second platform, same local-first method. **10 Meta landing tables** (1,070 columns) designed from the Marketing API — entities, daily stats, and the breakdown tables Meta's shape demands: `meta_CampaignActions` (the flattened `actions[]` array with attribution-window columns), `meta_CampaignPlacements`, `meta_CampaignDemographics` — created **per client** alongside `ads_*` in each `client_<slug>` dataset. 48,708 rows of Meta dummy data (objectives, reach×frequency, placements, age/gender, video, 28-day restatement), a `fact_meta_campaign_daily` mart, and the **Facebook Ads** module now reads it (spend, reach, link clicks, purchases, ROAS, campaigns, placements, demographics). **Campaign is now genuinely cross-channel** — Google Search / Performance Max / Shopping / Meta Ads blended from both marts. Module SQL moved into one shared `lib/bq-modules.mjs` imported by both the Vercel function and the local dev server, so they cannot drift. Dummy economics retuned to agency-realistic (Google 5.8x ROAS / $154 CPA, Meta 3.5x / $259, blended 4.8x).

## V1.0.21 — Cutover: production reads the real BigQuery marts
The per-client `client_<slug>` datasets now exist in the real `entangle-signals` project (australia-southeast1): all 109 DTS tables created, 28,080 dummy rows loaded via proper load jobs, `fact_ads_campaign_daily` built by the same transform SQL that ran on the emulator. `api/bq/[module].ts` now serves googleAds + campaign from the marts with **real date-range SQL + real previous-window deltas** (`real_window: true`, no scaling factors) — the deployed dashboard's Live mode reads genuinely windowed BigQuery data. Old `demo_client_*` datasets dropped (env=demo label). Modules not yet mapped to a mart return 404 and gracefully fall back to sample.

## V1.0.20 — Dashboard reads real windowed data from the local BigQuery replica
The local-first redesign's first end-to-end slice: `npm run bq:local` + `bq:init` + `bq:seed-local` + `bq:transform` build a full Google Ads DTS replica (109 tables) with realistic dummy data on a localhost BigQuery emulator; `local-bq/sql/fact_ads_campaign_daily.sql` builds the mart; `npm run dev:api` serves `/api/bq/*` from it with **real date-range SQL and real period-over-period deltas** (no scaling factors); Vite proxies `/api` in dev. `provider.ts` honours a `real_window` marker — mart data renders with `f=1`, the deployed demo API keeps its base+factor behaviour. Google Ads + Campaign modules now render fully from the mart in local dev (`LIVE · BigQuery mart`).

## V1.0.19 — "By device" donuts respond to the date range
The device-share donuts ("Clicks by device" on Google Ads, "Sessions by device" on GA4) now show **absolute click/session counts** in the legend (total × device share, scaled by the client × range factor) instead of only a fixed percentage — so the numbers move with the date picker (e.g. Mobile 8,094 at 30d → 51,802 at YTD). The **ring proportions stay constant by design** — a device *mix* is range-invariant (Mobile is ~57% of clicks regardless of window); only the volume scales. `DonutLegend` gained a `count` display mode.

## V1.0.18 — Live charts respond to the date range + no-blank-chart hardening
- **Charts render reliably:** replaced Recharts `ResponsiveContainer` with a measured `ChartBox` that renders a chart only once its container has a real width (and re-measures on resize). Fixes charts occasionally painting blank when mounted inside a hidden tab.
- **Live charts now respond to the date picker:** BigQuery marts now hold **base** values and the app applies the client × date-range factor at read time — so in Live mode *both* the KPI cards and the charts scale with the range (previously only cards did). Live and sample now match on every range. KPI numbers are unchanged (e.g. Total Ad Spend still 9,641 → 257,088 across ranges); they're just computed client-side from a BigQuery base rather than stored per-range. BigQuery re-loaded (315 base KPI rows + 36 path rows). *(In a real deployment, range aggregation moves server-side — SQL over dated rows — once real daily data lands.)*

## V1.0.17 — Donut fill + granularity on time-series bars
- **Fit:** donut charts now use percentage radii so they scale to fill their card instead of floating as a small fixed circle.
- **Granularity coverage:** time-series **bar** charts (e.g. "Net new per period", "Reach per post") now respond to D/W/M/Q/Y too — `GroupBar` re-buckets only when its x-axis is the shared time axis, so categorical bars (age/gender, by-channel, months) are correctly left alone. Note: **categorical charts (donuts by device/placement/category, demographics, funnels) don't respond to granularity by design — they have no time axis.**

---

### Notes
- **Bug fixes:** V1.0.1 (blank screen) and V1.0.7 (CPM/CPC scaling). Everything else is feature work or refactors.
- **Seed-key bumps** (re-seed browser `localStorage`): `dbm-ops-v3` (original) → `v4` (speed-to-lead default-on, V1.0.3) → `v5` (aiInsights field, V1.0.10) → `v6` (fixed demo-client factors, V1.0.14).
- **Pending action:** set `ANTHROPIC_API_KEY` in the Vercel project environment so opted-in clients get live Claude output; until then they gracefully show the `rules` fallback.
