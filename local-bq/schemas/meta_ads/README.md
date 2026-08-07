# Meta Ads Schema Replica

BigQuery table schemas for Meta (Facebook/Instagram) advertising data — 10 tables, 1,070 columns, one JSON file per table (`meta_<TableName>.json`), each a BigQuery-style schema array of `{name, type, mode}` entries. Used to seed the local BigQuery emulator with realistic Meta tables now, and as the contract the production loader must satisfy later.

`manifest.json` indexes all tables with `kind`, `grain` and column counts.

## The key difference from the Google Ads replica next door

`../google_ads/` is a **replica of somebody else's schema** — Google publishes the exact DTS column mapping, so that directory is a transcription and our job was to copy it faithfully.

**Meta publishes nothing equivalent. There is no Meta-owned BigQuery export.** Meta gives you the Marketing API (`/insights` and the entity nodes) and nothing else — no warehouse destination, no documented table shapes, no column names. So **we own these shapes.** Every table name, column name, type and grain in this directory is a design decision we made, not a spec we copied. That has two consequences:

1. **Nobody else will keep it in sync.** When Meta adds fields, someone here has to decide whether and how to land them.
2. **We are free to make it good** — hence the deliberate departures from what any off-the-shelf connector gives you (see "Design rules" below).

## Does a BigQuery DTS connector for Facebook Ads exist?

**Yes — but it is Google's, not Meta's, and it is not a substitute for this design.**

Google's BigQuery Data Transfer Service ships a first-party **Facebook Ads** connector ([docs](https://docs.cloud.google.com/bigquery/docs/facebook-ads-transfer), [transformation](https://docs.cloud.google.com/bigquery/docs/facebook-ads-transformation)), currently GA. Relevant facts from the research:

- It lands `AdAccounts`, `Campaigns`, `AdSets`, `Ads`, `AdInsights`, `AdInsightsActions` and related objects (expanded from 3 tables to ~12 in spring 2026).
- It supports a **refresh window of up to 30 days** on `AdInsights`, `AdInsightsActions`, `Ads`, `Campaigns` and `AdSets` — Google's own connector agrees with the restatement rule below.
- Change log entries confirm it is actively maintained and that its shape moves under you: `AdInsightsMMM` was **disabled** on 2026-07-06 (DMA column deprecation), and `ActionValue` in `AdInsightsActions` changed **INT → FLOAT** on 2026-07-25.

What that means for us:

- **It is a viable ingestion route** and the fastest path to real data — see option B below.
- **It is not the schema.** The DTS connector's tables are a subset: `AdSets` omits `optimization_goal`, `bid_amount`, `bid_strategy`, `effective_status`, `promoted_object` and `attribution_spec`; `Ads` omits `effective_status`; targeting is not flattened; the placement/demographic breakdown splits are not modelled as separate tables. Our tables are supersets designed to be **populated by** DTS, a custom loader, or both.
- The `ActionValue` INT → FLOAT change is a live example of why action-value columns here are `FLOAT64`: modelled/DDA conversions are fractional.

## Design rules baked into these files

- **All Meta ids are `STRING`.** `account_id`, `campaign_id`, `adset_id`, `ad_id` are 16–17 digit numerics; they exceed the JS safe-integer range and `INT64` round-trips are lossy in the dashboard layer. Never "optimise" these to `INT64`.
- **Two money conventions, deliberately not mixed.** Entity-snapshot budget/cap fields (`*_daily_budget`, `*_lifetime_budget`, `*_spend_cap`, `*_bid_amount`, `account_balance`, …) are `INT64` in the account currency's **minor units (cents)**, exactly as the API returns them. Insights `metrics_spend` and every other insights money field is `FLOAT64` in **major units**. Divide the former by 100 before comparing.
- **Every stats/breakdown row carries `account_currency`, `account_timezone_name`, `segments_attribution_setting` and `segments_action_attribution_windows`.** Without all four you cannot reconcile a number against Ads Manager. Insights days bucket in the **ad account timezone**, never UTC.
- **Actions are long/EAV, not pivoted.** `action_type` is an open string domain (~200 values, no closed enum Meta will commit to), so `meta_CampaignActions` is one row per action_type with the full attribution-window column set, rather than 200 columns that break the first time Meta ships a new event.
- **Nested objects land as JSON `STRING`** (or `REPEATED STRING` of JSON) rather than being dropped — e.g. `adset_targeting_json` preserves the raw blob alongside the 20 flattened targeting columns, so nothing is lost when Meta adds targeting keys.
- **`_DATA_DATE` and `_LATEST_DATE` (DATE) are appended last on every table**, matching the Google Ads replica's bookkeeping convention. Entity tables are daily snapshots: filter `_DATA_DATE = _LATEST_DATE` for current state.
- **Transforms must SELECT explicit column lists — never `SELECT *`.** Same seamless-cutover rule as the Google Ads replica: columns will be added over time, and `SELECT *` breaks downstream schemas when they are.

## Ingestion plan

Two options; the schema is identical either way, which is the point.

**A. Custom loader (default).** A scheduled Cloud Run job, one run per client per day:

1. Read the client's ad account list + long-lived system-user token from Secret Manager.
2. For each ad account, call the entity nodes (`/act_{id}`, `/campaigns`, `/adsets`, `/ads`) and write a full daily snapshot row per entity with today's `_DATA_DATE`.
3. For each ad account, call `/insights` with `time_increment=1` at `level=campaign|adset|ad` for the trailing window, plus **separate calls per legal breakdown combination** (demographics, placements, actions). Meta forbids many `breakdowns` + `action_breakdowns` combinations in a single request — the loader must hold a compatibility matrix in config, validated empirically, and issue one call per legal combination.
4. Rows from a pull that did not request a given breakdown leave those `segments_*` columns **NULL**. A NULL segment means *"not broken out in this pull"*, not *"unknown"*. Downstream aggregations must filter to the pull they intend, never `SUM()` across mixed-breakdown rows.
5. `MERGE` into the client's dataset (see restatement rule). Never append-only.

**B. Managed connector.** Point Google's Facebook Ads DTS connector (or Fivetran/Supermetrics) at a staging dataset and run our own `MERGE` from its tables into these ones. Cheaper to stand up, but it only fills the subset of columns the connector exposes, and its shape changes on Google's schedule rather than ours — so treat it as a source *into* this schema, not as the schema.

## Conversion lag and restatement — the rule that matters most

**Meta restates historical figures for up to 28 days.** A conversion attributed to a 7-day-click or 28-day-click window is written back against the *impression* date, not the conversion date, so yesterday's `spend`/`purchase`/`ROAS` numbers keep moving for four weeks after the fact.

Therefore:

- **Re-pull a trailing ~28-day window on every run** (we use a 30-day window for safety margin) and `MERGE` on the full grain key — `(segments_date, account_id, campaign_id[, adset_id][, ad_id], all segment columns)` for stats/breakdowns, plus `action_collection` and `action_type` for `meta_CampaignActions`.
- **Never `INSERT`-only into a stats or breakdown table.** Append-only ingestion silently double-counts restated days.
- Entity snapshot tables (`meta_Account`, `meta_Campaign`, `meta_AdSet`, `meta_Ad`) are *not* restated — they are point-in-time and each day's rows are immutable once written.
- Expect a report run today for last week to differ from the same report run next month. That is Meta working correctly, not a loader bug. Report "as at" dates on client-facing outputs.

## Per-client layout

These tables are created **inside each `client_<slug>` dataset**, alongside that client's `ads_*` (Google Ads) tables — one dataset per client, all sources together:

```
client_aqua_pulse_spas/
  ads_Campaign, ads_CampaignStats, …          (Google Ads DTS replica)
  meta_Campaign, meta_CampaignStats, …        (this directory)
```

The schema files are dataset-agnostic; the seeding script instantiates them per client. Cross-source blending (Google + Meta in one paid-media view) happens in the mart layer above these raw tables, where the differing id types (`ads_*` `customer_id` is `INT64`, Meta ids are `STRING`) and money conventions are normalised — never by assuming the raw tables already agree.

## Partitioning and clustering (production)

| Table kind | Partition | Cluster |
|---|---|---|
| snapshot | `_DATA_DATE` | `(account_id, <entity>_id)` |
| stats | `segments_date` | `(account_id, campaign_id[, adset_id][, ad_id])` |
| breakdown | `segments_date` | `(account_id, campaign_id, <leading segment columns>)` |

`meta_AdStats` is the highest-row-count table by a wide margin — the four placement/device segment columns multiply rows. If volume becomes a problem, split it by breakdown combination before reaching for anything cleverer.
