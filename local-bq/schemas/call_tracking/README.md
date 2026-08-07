# Call Tracking Schema (WildJar + CallRail)

BigQuery table schemas for call-tracking data — 3 tables, 239 columns, one JSON file per table (`calls_<TableName>.json`), each a BigQuery-style schema array of `{name, type, mode}` entries. Used to seed the local BigQuery emulator with realistic call data now, and as the contract the production loader must satisfy later.

`manifest.json` indexes all tables with `kind`, `grain` and column counts.

| Table | Kind | Columns | Grain |
|---|---|---|---|
| `calls_Call` | fact | 162 | one row per call |
| `calls_TrackingNumber` | snapshot | 37 | one row per tracking number per `_DATA_DATE` |
| `calls_DailyStats` | stats | 40 | account × date × source/medium/campaign/number/direction/device |

## We own these shapes

Neither vendor has a native BigQuery export. **Verified against both APIs, not assumed:**

- **WildJar** has no BigQuery destination, no Looker Studio connector, and nothing warehouse-shaped anywhere in the product or integrations catalogue. The closest first-party thing is the **External Reporting Connector** — a signed URL emitting CSV or JSON.
- **CallRail** has no native BigQuery destination either. Every "CallRail → BigQuery" product on the market (Fivetran, Airbyte, Stitch, Improvado, …) is third-party ETL sitting on the same public REST API. CallRail's own bulk option is an account-level CSV export.

So, like `../meta_ads/` and unlike `../google_ads/` (a transcription of Google's published DTS mapping), **every table name, column name, type and grain in this directory is a design decision we made.** Nobody else will keep it in sync when the vendors add fields — and we are free to make it good.

The two platforms are modelled as **one unified fact table with a `platform` discriminator** (`wildjar` | `callrail`) rather than two parallel families. Roughly 35 concepts map cleanly to canonical columns; where only one platform offers a field, the union is carried and the other platform's rows are NULL. Fields with no counterpart at all survive in `wildjar_raw_json` / `callrail_raw_json`.

## Design rules baked into these files

- **All ids are `STRING`.** WildJar returns numeric-looking ids *as strings*; CallRail ids are `CAL…` prefixed. `call_uid` is the canonical natural key: `platform || '|' || call_id` (WildJar `uuid`, CallRail `id`). Never "optimise" any id column to `INT64`.
- **This family uses `TIMESTAMP`** — unlike the daily ad tables, calls need time-of-day. `call_start_time` / `call_end_time` are UTC. `call_date` (DATE) sits alongside as the partition-friendly column and is the **account-local** calendar date, so a 11pm call in Perth buckets the way the client expects.
- **Local time is stored twice, deliberately.** `call_start_time` (UTC `TIMESTAMP`) for maths, `call_start_time_local` (naive `STRING`) + `call_timezone` (IANA) for display and business-hours logic. WildJar's `dateStartGMT` is a naive string — parse it as UTC explicitly, do not let a driver localise it. WildJar's `dateStart*User*` fields vary by API caller and are **not** landed.
- **Durations are `INT64` seconds; money and ratings are `FLOAT64`.** `call_duration_seconds` is total (ring + announcements + talk). `call_talk_time_seconds` is WildJar-only and is the honest connected time. `call_ring_time_seconds` is **derived and approximate** — `duration - talkTime` on WildJar (includes IVR), `duration - recording_duration` on CallRail.
- **Canonical outcome plus raw outcome.** `outcome_status` is our five-value enum (`answered|missed|abandoned|voicemail|in_progress`) with boolean siblings for cheap dashboard filters; `outcome_status_raw` keeps the platform's own value (WildJar `status`, CallRail `call_type`) so nothing is lost in normalisation.
- **CallRail's four attribution milestones are flattened, not nested** — `attribution_first_touch_*`, `attribution_lead_created_*`, `attribution_qualified_*`, `attribution_last_touch_*`, eight symmetric columns each. Switching the dashboard's attribution model becomes a column swap rather than an UNNEST. WildJar has **no multi-touch model** (one attribution set per call), so any WildJar equivalent must be reconstructed in the mart by sequencing calls per `attribution_visitor_id`.
- **`attribution_gbraid` / `attribution_wbraid` are parsed, not fetched.** Neither platform exposes them. The loader regex-extracts them from the landing URL and also writes the full querystring to `attribution_landing_page_params_json` — which is additionally the only way to recover raw `utm_*` values for WildJar, since WildJar collapses UTM and referrer logic into a single resolved `source`.
- **Nested objects land as JSON `STRING`** (`call_keypad_entries_json`, `attribution_landing_page_params_json`, `*_raw_json`) rather than being dropped, matching the `../meta_ads/` convention.
- **Type traps to handle on ingest, all confirmed in the APIs:** WildJar returns `duration`, `talkTime`, `id`, `timestamp` as strings; `firstTimeCaller` is `"yes"`/`"no"` not a boolean; `tags` is `null` (not `[]`) when empty; `caller` can be the literal string `"anonymous"`; `timestamp` is documented as milliseconds but the examples are seconds — validate against `dateStartGMT` before trusting it. CallRail's `recording_duration` is a string while `duration` is an integer.
- **`outcome_value_currency` is not returned by either API.** CallRail gives a bare `value` integer. The loader fills the currency from client config; it is here so money is never stored unlabelled.
- **`_DATA_DATE` and `_LATEST_DATE` (DATE) are appended last on every table**, same bookkeeping semantics as the other families. `calls_TrackingNumber` is a daily snapshot: filter `_DATA_DATE = _LATEST_DATE` for current state.
- **Transforms must SELECT explicit column lists — never `SELECT *`.** Same seamless-cutover rule as the other replicas.

## Ingestion

Two mechanisms per platform, and you need both.

**1. REST pull by date range — backfill and reconciliation.**

- WildJar `GET /v2/call/` with `dateFrom`/`dateTo` + `page`/`perPage` (max 2000). **But the list endpoint returns `web` as only `{source, medium}`** — gclid, landing page, campaign, keyword, device, IP all require the per-call detail endpoint, and the rate limit is **150 GET/hour per user token**. Per-call enrichment does not scale. Use the **External Reporting Connector** (signed URL, CSV or JSON, `limit` up to 10,000, natural-language date params, *not* subject to the 150/hr limit) as the primary WildJar backfill path. Note it takes up to 24 hours to populate on first creation.
- CallRail `GET /calls.json` with `start_date`/`end_date` and `relative_pagination=true` (max 250/page; 1,000/hr, 10,000/day). **The default response omits nearly all attribution** — you must pass an explicit `fields=` list (`source,medium,campaign,keywords,gclid,msclkid,fbclid,utm_*,landing_page_url,referring_url,session_uuid,device_type,lead_status,tags,value,note,transcription,call_summary,sentiment,milestones,…`).

**2. Webhooks — near-real-time, and the required path for WildJar attribution.**

- WildJar: subscribe to **call completed** *and* **call transcribed**. The payload body is fully templated by you (`push.data` with `{{variable}}` placeholders), so define it once to mirror `calls_Call` exactly. Retries are configurable (`push.retry`, `push.interval`).
- CallRail: subscribe to **post-call** *and* **call-modified** (plus the outbound equivalents). CallRail **does not resend failed webhooks** and auto-disables an endpoint after repeated failures — respond 2xx and reconcile gaps by REST pull. Post-call fires only once recording + transcription + summary attach, with a 20-minute cap; if that trips, the recording data arrives only via `call_modified`.

Land raw webhook payloads **append-only** in a staging table with `_ingested_at`, then MERGE into `calls_Call` taking the latest row per `call_uid` by ingestion time. Free audit trail, and it covers CallRail's no-retry behaviour. `_ingestion_source` records which path wrote the row.

`calls_DailyStats` is **recomputed** from `calls_Call` for every date in the re-pull window, never incrementally added to. CallRail's `/calls/summary.json` and `/calls/timeseries.json` exist and are useful for *reconciling* our rollup against the vendor's; WildJar has no aggregate call endpoint at all, so BigQuery is the single source of roll-up truth.

## Mutability — the rule that matters most

**Call records change after the call ends. On both platforms. This is an upsert problem, not an append problem** — the opposite of the immutable-once-final assumption you can *almost* make about ad stats.

What mutates: tags (auto-applied by Smart Tag / Spotlights / AI Lead Agent minutes-to-hours later), notes, score, lead status, value, transcription (arrives asynchronously), AI summary, recording attachment, and spam marking. CallRail's `call_modified` webhook makes it explicit — it delivers the modified record plus a `changes` array, which we land in `outcome_modified_fields`.

The hard constraint: **neither API has an `updated_since` / `modified_after` filter.** WildJar has no `created_at` or `updated_at` at all; CallRail has `created_at` but no `updated_at`. You cannot do an incremental pull on mutation.

Therefore:

- **Re-pull a trailing window on every run** — 7 days minimum for transcription/AI attachment, **30–35 days** to catch the score and lead-status corrections analysts make late.
- **`MERGE` on `call_uid`.** Never `INSERT`-only into `calls_Call`; append-only ingestion produces duplicate calls with divergent tags.
- **Recompute `calls_DailyStats` for the whole re-pull window** after the merge. A qualified-lead flag set on day 30 changes day 1's `metrics_qualified_leads`.
- `calls_TrackingNumber` is *not* restated — each day's snapshot rows are immutable once written.
- Expect a call report run today to differ from the same report run next month. Report "as at" dates on client-facing outputs.

## Recording and transcript retention — the perishable asset

- **WildJar: 12 months** from the call date, per their T&Cs — and AI outputs (transcripts, sentiment, keyword tags, scores, summaries) expire on the same 12-month clock.
- **CallRail: 25 months** for communication records including voicemail. Automatically deleted thereafter; **the period cannot be extended.**

The *metadata* is ours forever once landed; the *audio* is not. So:

- **Copy the MP3 to our own GCS bucket at ingestion time** and store the URI in `call_recording_gcs_uri` alongside the vendor URL. Twelve months arrives faster than any client expects.
- **Land the full transcript text in `outcome_transcript_text`** rather than planning to re-fetch it.
- **Never store a CallRail HIPAA-account recording URL** — those are ~24h expiring S3 links. Re-request from `/calls/{id}/recording.json` on demand.

## PII — stricter than the ad tables

This is the only family in the warehouse carrying **direct personal data about the client's customers**, not aggregated ad metrics. Treat it accordingly.

Direct identifiers: `call_caller_number`, `call_caller_name`, `call_caller_city` / `_state` / `_postcode`, `attribution_visitor_ip` (WildJar exposes the visitor IP; CallRail does not), `attribution_person_id`, `attribution_visitor_id`. Free-text that can contain anything a caller said: `outcome_transcript_text`, `outcome_summary`, `outcome_note`. Plus `call_recording_url` / `call_recording_gcs_uri`, which point at a recording of an identifiable person's voice.

Controls, in line with the per-client dataset isolation the ISO 27001 posture rests on:

- **Per-client dataset isolation is the primary control.** These tables live only in that client's `client_<slug>` dataset. No cross-client call table exists, and none should be created.
- **Expose calls to the dashboard through an authorized view, not the base table.** The view masks `call_caller_number` (last 3 digits, e.g. `+61 4•• ••• •12`), drops `attribution_visitor_ip`, and omits recording URIs unless the client's plan includes call review.
- **Transcript and recording access is a separate, explicitly granted role.** A user who can see call volume by campaign should not automatically be able to read what a caller said or play their voice.
- **Signed, short-lived URLs for `call_recording_gcs_uri`** — never a public object, never a long-lived link in a dashboard payload.
- **Retention parity:** our GCS copies inherit a lifecycle rule at least as strict as the client contract, and deletion requests must fan out to GCS objects and `outcome_transcript_text` as well as the row.
- Australian callers put this squarely under the Privacy Act 1988 APPs — and call recording consent is a *state*-level matter, so the consent announcement is the client's obligation, not ours. Do not ingest recordings for a client who has not confirmed their announcement is in place.

## Per-client layout

These tables are created **inside each `client_<slug>` dataset**, alongside that client's other sources — one dataset per client, all sources together:

```
client_aqua_pulse_spas/
  ads_Campaign, ads_CampaignStats, …          (Google Ads DTS replica)
  meta_Campaign, meta_CampaignStats, …        (Meta Ads)
  events_YYYYMMDD, users_YYYYMMDD, …          (GA4 native export)
  calls_Call, calls_TrackingNumber,
  calls_DailyStats                            (this directory)
```

The schema files are dataset-agnostic; the seeding script instantiates them per client. A client may use WildJar, CallRail, or both — the `platform` discriminator means both land in the same three tables and the dashboard does not branch.

Cross-source blending happens in the mart layer above these raw tables. The join that makes call tracking pay for itself is `calls_Call.attribution_gclid` → `ads_*` click ids, and `calls_Call.attribution_session_id` / `attribution_visitor_id` → GA4 sessions. Both are best-effort: gclid is present only on paid clicks that survived to a DNI-swapped number, and WildJar's `user` + `session` concatenated form the GA client id, which is not the GA4 `user_pseudo_id` — the mart must reconcile them, never assume they match.

## Partitioning and clustering (production)

| Table | Partition | Cluster |
|---|---|---|
| `calls_Call` | `call_date` | `(account_id, call_tracking_number, attribution_source)` |
| `calls_TrackingNumber` | `_DATA_DATE` | `(account_id, number_id)` |
| `calls_DailyStats` | `segments_date` | `(account_id, segments_source, segments_campaign)` |

Volume here is orders of magnitude below the ad tables — a busy client does hundreds of calls a day, not millions of impressions — so `calls_Call` stays comfortably wide. `outcome_transcript_text` is the only column with real size; if scan cost ever bites, move transcripts to a side table keyed on `call_uid` rather than narrowing the fact.
