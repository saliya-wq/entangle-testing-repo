# GA4 BigQuery Export Schema Replica

BigQuery table schemas for the **GA4 native BigQuery Export** — 3 tables, one JSON file per table, each a BigQuery schema array of `{name, type, mode, fields}` entries with **full nesting preserved**. Used to seed the local BigQuery emulator with realistically shaped GA4 tables now, and as the contract the production loader must satisfy later.

| File | Real export table | Local replica table | Top-level fields | Leaf columns | Max nesting depth |
|---|---|---|---|---|---|
| `ga4_events.json` | `events_YYYYMMDD` (and `events_intraday_YYYYMMDD`) | `ga4_events` | 30 | 190 | 4 |
| `ga4_users.json` | `users_YYYYMMDD` | `ga4_users` | 11 | 35 | 3 |
| `ga4_pseudonymous_users.json` | `pseudonymous_users_YYYYMMDD` | `ga4_pseudonymous_users` | 12 | 36 | 3 |

`manifest.json` indexes them all.

## Google owns these shapes

Unlike `../meta_ads/` (which we designed ourselves), this directory is a **faithful transcription** of a schema Google publishes and controls: [\[GA4\] BigQuery Export schema](https://support.google.com/analytics/answer/7029846) and [\[GA4\] BigQuery Export user-data schema](https://support.google.com/analytics/answer/12769371). Do not "improve" field names or types here — the physical export will not match. Improvements belong in the transform layer (`../../sql/`), not in the replica.

This is also **not** a BigQuery Data Transfer Service transfer. It is a first-party export configured in GA4 Admin → Product links → BigQuery links. There is no DTS config and **no backfill** — data only flows from the moment the link is created.

## Export cadence in the real thing

Two independent toggles on the BigQuery link:

- **Daily** (batch) — one `events_YYYYMMDD` table per day, landing within ~24 hours of the day closing in the property timezone. This is the authoritative table.
- **Streaming** (optional) — continuous, into `events_intraday_YYYYMMDD` with a latency of minutes. Same schema *shape*, but `user_ltv`, `session_traffic_source_last_click` and `publisher` are never populated, and the table is **deleted** once the matching daily table lands.

The user-data export (`users_*`, `pseudonymous_users_*`) is a third, separate opt-in and is daily only.

## Replica layout vs. the real export — the only thing that changes at cutover

This is the part to internalise before writing any SQL against the local emulator.

| | Real GA4 export | This replica (local emulator) |
|---|---|---|
| Dataset | `analytics_<numericPropertyId>` (e.g. `analytics_250794857`) | the client dataset, e.g. `client_aqua_pulse_spas` |
| Events table(s) | **date-sharded**: `events_20260801`, `events_20260802`, … queried through the `events_*` wildcard | **one table**, `ga4_events` |
| Date selection | `_TABLE_SUFFIX` pseudo-column | the `event_date` column (`STRING 'YYYYMMDD'`), which is present and populated in both |
| Users tables | `users_YYYYMMDD`, `pseudonymous_users_YYYYMMDD` | `ga4_users`, `ga4_pseudonymous_users` |

**The row schema is byte-for-byte identical.** Every column name, type, mode and level of nesting in `ga4_events` is exactly what a real `events_YYYYMMDD` row has — that is the whole point of the replica. Which means:

> **The only change required at cutover is the `FROM` clause.** Nothing in the `SELECT`, `UNNEST`, `WHERE` (beyond the date predicate) or `GROUP BY` needs to move.

```sql
-- local emulator today
FROM `client_aqua_pulse_spas.ga4_events`
WHERE event_date BETWEEN '20260101' AND '20260806'

-- production tomorrow
FROM `proj.analytics_250794857.events_*`
WHERE _TABLE_SUFFIX BETWEEN '20260101' AND '20260806'
```

Because `event_date` exists in both, a predicate written against `event_date` is portable as-is; it just stops pruning shards in production, so add the `_TABLE_SUFFIX` filter as well when you cut over. Keep the date predicate isolated on its own line so the swap stays a two-line diff.

## The key difference from the Google Ads and Meta replicas: no `_DATA_DATE` / `_LATEST_DATE`

Both sibling directories append `_DATA_DATE` and `_LATEST_DATE` (DATE) as bookkeeping columns on every table. **GA4 has neither, and we deliberately did not add them.**

GA4's export is **date-sharded, not partitioned**: the shard date *is* the partition, carried in the table name (`events_20260806`) and readable as the `_TABLE_SUFFIX` pseudo-column. Adding synthetic date columns would diverge from the physical export for no gain. So:

```sql
-- correct: prune shards with _TABLE_SUFFIX
FROM `proj.analytics_XXXXXXXXX.events_*`
WHERE _TABLE_SUFFIX BETWEEN '20260101' AND '20260806'
```

Two consequences to remember:

- **`events_*` also matches `events_intraday_*`.** Exclude it with `AND _TABLE_SUFFIX NOT LIKE 'intraday%'`, or query `events_intraday_*` separately and UNION.
- **The last ~72 hours are not final.** Google restates daily tables for up to three days after the event date (late hits, geo/model backfill). Treat the trailing 3 days as provisional in any cached or materialised layer.

`events_intraday_*` shares this same schema *shape*, but `user_ltv`, `session_traffic_source_last_click` and `publisher` are never populated there.

## Type and shape gotchas encoded in these files

These are the ones that get transcribed wrong most often. All of them are correct as written in the JSON:

1. **`event_date` is `STRING`** (`'YYYYMMDD'`, property timezone) — not `DATE`.
2. **`event_timestamp` and every `*_timestamp*` / `*_micros` field is `INT64` microseconds** — use `TIMESTAMP_MICROS()`, never `TIMESTAMP_SECONDS()`.
3. **`items.item_list_index` is `STRING`**, while `items.quantity` is `INT64`.
4. **`device.is_limited_ad_tracking` and all three `privacy_info.*` fields are `STRING`** (`"Yes"` / `"No"`), not `BOOL`. The only genuine booleans are `is_active_user` (events) and `audiences.npa` (users tables).
5. **`stream_id` is `STRING` in `events_*` but `INT64` in `pseudonymous_users_*`.** Not a typo.
6. **There is no `user` wrapper record.** `user_id`, `user_pseudo_id`, `user_first_touch_timestamp`, `is_active_user`, `user_properties`, `user_ltv` and `privacy_info` are all top-level columns.
7. **`float_value` exists but is never populated** in `event_params`, `user_properties` and `items.item_params` — GA4 writes floats into `double_value`. The column is kept for schema fidelity; read numerics with `COALESCE(int_value, double_value, float_value)`.
8. **BigQuery has no FLOAT32.** Every float here is `FLOAT64` (the legacy JSON spelling would be `FLOAT`).
9. **Modes:** every scalar is `NULLABLE`; nothing is `REQUIRED`. The only `REPEATED` fields are `event_params`, `user_properties`, `items`, `items.item_params` — plus `audiences` and `user_properties` in the users tables.
10. **`items.item_params` is REPEATED inside REPEATED `items`** — a double `UNNEST` is required, and that is what makes the events table 4 levels deep.

## Legacy columns included on purpose

Four fields are physically present in real exports but have been dropped from Google's current published doc tables. They are included here for byte-exact parity with an actual export, and are **always NULL**:

- `device.browser`, `device.browser_version` — legacy Firebase columns. Use `device.web_info.browser` / `.browser_version`.
- `app_info.install_store` — superseded by `app_info.install_source`.
- `event_dimensions.hostname` — deprecated; use `device.web_info.hostname`.

If you ever need a schema that matches today's *published docs* rather than a real table, drop those four.

## Traffic source: three records, three different scopes

Getting these confused is the most common source of wrong attribution numbers:

- **`traffic_source`** — user-scoped, **first-touch**, immutable. What first acquired the user. `name` is the campaign name.
- **`collected_traffic_source`** — event-scoped, raw UTMs and click IDs exactly as collected. No modelling applied.
- **`session_traffic_source_last_click`** — session-scoped **last-click**, resolved by GA4. Six mutually exclusive channel sub-records (`manual_campaign`, `google_ads_campaign`, `cross_channel_campaign`, `sa360_campaign`, `cm360_campaign`, `dv360_campaign`); exactly one is populated per session. NULL in intraday tables.

Note that `cross_channel_campaign` does **not** contain `default_channel_group` / `primary_channel_group` — those are GA4 UI dimensions only and must be derived in SQL.

## Querying the nested records: the `UNNEST` idiom

Nothing useful in GA4 is a plain column. `page_location`, `page_title`, `ga_session_id`, `session_engaged`, `engagement_time_msec` and every custom parameter live as key/value pairs inside the REPEATED `event_params` record, with the value split across four typed slots (`string_value`, `int_value`, `float_value`, `double_value`). Same pattern for `user_properties` and `items.item_params`.

**Pulling one parameter — scalar subquery (preferred).** Does not multiply rows, reads naturally, and is what most of `../../sql/` should use:

```sql
SELECT
  event_date,
  (SELECT value.string_value FROM UNNEST(event_params)
     WHERE key = 'page_location')            AS page_location,
  (SELECT value.int_value    FROM UNNEST(event_params)
     WHERE key = 'ga_session_id')            AS ga_session_id,
  (SELECT value.int_value    FROM UNNEST(event_params)
     WHERE key = 'engagement_time_msec')     AS engagement_time_msec
FROM `client_aqua_pulse_spas.ga4_events`
WHERE event_name = 'page_view';
```

Pick the slot that matches the parameter's type — a string param read out of `int_value` silently returns NULL rather than erroring. When in doubt, `COALESCE(value.int_value, value.double_value, value.float_value)` for numerics (see gotcha 7).

**Cross-join form — use when you want one row per parameter**, e.g. to inspect what parameters exist:

```sql
SELECT ep.key, COUNT(*) AS n
FROM `client_aqua_pulse_spas.ga4_events`, UNNEST(event_params) AS ep
GROUP BY ep.key ORDER BY n DESC;
```

This **multiplies rows** by the number of params on each event — never `SUM()` an event-level metric downstream of it without deduplicating first.

**Items are a double `UNNEST`** (`items` is REPEATED, and `items.item_params` is REPEATED inside it):

```sql
SELECT i.item_name, SUM(i.quantity) AS units, SUM(i.item_revenue) AS revenue
FROM `client_aqua_pulse_spas.ga4_events`, UNNEST(items) AS i
WHERE event_name = 'purchase'
GROUP BY i.item_name;

-- and one level deeper, for a custom item parameter
FROM `client_aqua_pulse_spas.ga4_events`,
     UNNEST(items) AS i,
     UNNEST(i.item_params) AS ip
```

**A session is `ga_session_id` + `user_pseudo_id`**, never `ga_session_id` alone — the id is only unique within a user:

```sql
COUNT(DISTINCT CONCAT(user_pseudo_id, '-', CAST(
  (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')
  AS STRING))) AS sessions
```

Non-repeated records (`device`, `geo`, `traffic_source`, `ecommerce`, `session_traffic_source_last_click`, `user_ltv`, `privacy_info`, `app_info`, `publisher`) are **not** unnested — address them with dotted paths: `device.web_info.hostname`, `geo.city`, `session_traffic_source_last_click.google_ads_campaign.campaign_name`.

## Counting events

Repeated-record expansion means one event spans multiple logical rows once unnested, and **GA4 provides no unique event ID**. Count with a synthetic key:

```sql
COUNT(DISTINCT CONCAT(user_pseudo_id, '-', CAST(event_timestamp AS STRING), '-', event_name))
```

## Users vs pseudonymous users

Both user-data tables are a separate opt-in export with one row per identifier, upserted whenever any field changes.

- `users_YYYYMMDD` carries `user_id`, never `pseudo_user_id`, and **can include unconsented users** provided a `user_id` is present.
- `pseudonymous_users_YYYYMMDD` carries `pseudo_user_id` plus `stream_id` (`INT64`), never `user_id`, and **excludes unconsented users**.
- Their `privacy_info` record has **different sub-fields** from the events table's (`is_ads_personalization_allowed`, `is_limited_ad_tracking`), and their `user_properties.value` has **only** `string_value` and `set_timestamp_micros` — no int/float/double variants.

## Other operational notes

- Dataset name is `analytics_<numeric_property_id>` (e.g. `analytics_250794857`) — the GA4 property ID, not the measurement ID.
- Free GA4 properties have a **1M events/day daily-export cap**; 360 does not.
- **Transforms must SELECT explicit column lists — never `SELECT *`.** Google adds columns to this export over time (`is_active_user`, `batch_*`, `publisher` and `session_traffic_source_last_click` all arrived after launch), and `SELECT *` breaks downstream schemas when they do.
