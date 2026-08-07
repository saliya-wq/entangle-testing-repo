# Facebook Page Schema (organic — Meta Graph API Page Insights)

BigQuery table schemas for **organic Facebook Page** data — 4 tables, 138 columns, one JSON file per table (`fbpage_<TableName>.json`), each a BigQuery-style schema array of `{name, type, mode}` entries. Used to seed the local BigQuery emulator with realistic Page data now, and as the contract the production loader must satisfy later.

This is the **organic** side of Facebook. Paid sits in `../meta_ads/` and is a completely different API (Marketing API `/insights`, ad account scoped). The two families deliberately do not share columns — join them in the mart on date, not in landing.

`manifest.json` indexes all tables with `kind`, `grain` and column counts.

| Table | Kind | Columns | Grain |
|---|---|---|---|
| `fbpage_Page` | snapshot | 29 | one row per page per `_DATA_DATE` |
| `fbpage_DailyStats` | stats | 39 | page × day × period |
| `fbpage_Post` | post | 60 | one row per post per `_DATA_DATE` snapshot |
| `fbpage_Demographics` | demographics | 10 | page × day × segment_type × segment_value |

## We own these shapes

**Meta has no native BigQuery export for Page Insights.** There is no Data Transfer Service mapping, no first-party warehouse destination, no bulk file drop. Every "Facebook Pages → BigQuery" product on the market (Supermetrics, Fivetran, Windsor, Dataslayer, Improvado) is third-party ETL sitting on the same public Graph API, and each one invents its own column names.

So, like `../meta_ads/` and `../call_tracking/` — and unlike `../google_ads/`, which is a transcription of Google's published DTS mapping — **every table name, column name, type and grain in this directory is a design decision we made.** Nobody upstream will keep it in sync, and we are free to make it good.

Sources used: the Page node reference, `/{page-id}/insights`, the Page Post node reference, and `/{post-id}/insights` on Graph API v25/v26.

## Design rules baked into these files

- **All ids are `STRING`.** Page ids and post ids are large numeric-looking tokens (`{page-id}_{story-id}` for posts) that overflow or silently lose precision as `INT64`. Never "optimise" `page_id`, `post_id`, `post_from_id` or `post_promotable_id` to an integer.
- **Prefixes are enforced.** `page_*` / `post_*` for entity attributes, `metrics_*` for measures, `segments_*` for dimensions. Metric columns drop the API's redundant `page_` / `post_` prefix because the table already scopes it — `page_post_engagements` lands as `metrics_post_engagements`, `post_reactions_like_total` as `metrics_reactions_like_total`.
- **`TIMESTAMP` only where a moment matters.** `post_created_time` and `post_updated_time` are UTC `TIMESTAMP`. `post_date` (DATE) sits alongside as the partition-friendly column so `WHERE post_date BETWEEN …` never scans the whole table, and so post lists bucket by the client's calendar day rather than by UTC.
- **`segments_period` is carried on every insights row** (`day` | `week` | `days_28` | `lifetime`). Meta returns the same metric name at three windows; without this column a `SUM()` triple-counts. The loader defaults to `day` for `fbpage_DailyStats`/`fbpage_Demographics` and `lifetime` for `fbpage_Post`.
- **Video watch time is `INT64` milliseconds** (`metrics_video_view_time`), matching what the API returns. `metrics_video_avg_time_watched` and `metrics_video_length` are `FLOAT64`.
- **No derived rates are landed.** Engagement rate, view rate, follower growth rate are all mart concerns. Landing holds only what the API returned, so a definition change is a view change and not a backfill.
- **Repeated fields — the dummy generator must emit real JSON arrays, not comma strings:**
  - `fbpage_Page.page_category_list` (`STRING` REPEATED) — the Page's sub-category names.
  - `fbpage_Page.page_emails` (`STRING` REPEATED) — emails from the About section.
  - `fbpage_Post.post_message_tags` (`STRING` REPEATED) — tagged profile/page names in the message body.
  - Everything else is scalar.
- **`_DATA_DATE` and `_LATEST_DATE` (DATE) are appended last on every table.** `fbpage_Page` is a daily snapshot — filter `_DATA_DATE = _LATEST_DATE` for current state. `fbpage_DailyStats` and `fbpage_Demographics` carry `_DATA_DATE` = the stat date (equal to `segments_date`). `fbpage_Post` carries `_DATA_DATE` = the snapshot date, **not** the publish date, because lifetime metrics keep moving (see Mutability).
- **Transforms must SELECT explicit column lists — never `SELECT *`.** Same seamless-cutover rule as the other replicas.

## Ingestion

**REST pull, per account, per day.** No streaming, no webhooks worth having (Page webhooks fire on content changes, not on insight deltas).

1. `GET /{page-id}?fields=id,name,username,category,category_list,about,description,link,website,phone,emails,fan_count,followers_count,talking_about_count,rating_count,overall_star_rating,new_like_count,were_here_count,verification_status,is_published,location,picture,cover` → one row into `fbpage_Page`.
2. `GET /{page-id}/insights?period=day&since=…&until=…&metric=…` → `fbpage_DailyStats`. The `since`/`until` window is capped, so backfill in chunks (93 days is a safe stride) and note that `until` is **exclusive**.
3. `GET /{page-id}/published_posts?fields=id,created_time,updated_time,message,story,status_type,permalink_url,full_picture,icon,is_published,is_hidden,is_expired,promotable_id,from,message_tags,attachments{media_type,title,target},shares,comments.summary(true).limit(0),likes.summary(true).limit(0)` then `GET /{post-id}/insights?metric=…` (batch these) → `fbpage_Post`. Use `published_posts` rather than `feed` so visitor posts don't pollute the table; `is_published=false` rows are scheduled/unpublished and are kept but should be excluded from performance marts.
4. `GET /{page-id}/insights?period=day&metric=page_fans_country,page_fans_city,page_fans_locale` → unpivot the returned maps into one row per segment for `fbpage_Demographics`.

**Token and permissions.** Everything here needs a **Page access token** (not a user token) with **`read_insights`**, plus `pages_read_engagement` and `pages_show_list`. The app must have passed App Review for those scopes, and the token holder must have an admin/analyst role on the Page. Page access tokens derived from a long-lived user token last ~60 days — the loader must refresh and alert before expiry, because the failure mode is a silent 190 error on every account at once. *(For contrast, when the LinkedIn sibling family lands it needs `r_organization_social` / `rw_organization_admin` and an organisation ACL, not a page token.)*

**Rate limits.** Page-level calls are governed by Meta's **Business Use Case (BUC) rate limiting** — a rolling 24-hour budget scored on calls, CPU time and total time, returned in the `X-Business-Use-Case-Usage` header. Read that header and back off at 75% rather than waiting for the 4 / 17 / 32 error codes. Post insights are the expensive part: use the **Batch API** (50 sub-requests per call) or `?ids=a,b,c` fan-out for post insights instead of one request per post, and cap the post-refresh window (see below). A 200-post page refreshed naively will burn the budget before lunch.

## Deprecated metrics — deliberately excluded

Meta gutted Page Insights across three waves, and the naive metric list every tutorial still recommends now returns `(#100) Invalid metric`. What is modelled here is what **survives as of August 2026**.

**Wave 1 — 16 September 2024 (~80 metrics).** Excluded, no replacement:

| Removed | Note |
|---|---|
| `page_engaged_users` | **No successor.** The brief asked for it; it is gone. Use `metrics_post_engagements` (`page_post_engagements`) as the engagement headline. |
| `page_consumptions*`, `page_consumptions_by_consumption_type*` | Replaced at post level only, by `post_clicks_by_type` → `metrics_clicks_by_type_*`. |
| `page_negative_feedback*`, `page_positive_feedback_by_type*` | No successor. |
| `page_content_activity*` (all `_by_action_type` / `_by_age_gender` / `_by_city` / `_by_country` / `_by_locale` variants) | No successor. |
| `page_impressions_by_age_gender_unique`, `page_fans_gender_age` | **All age/gender demographics removed from the API.** See Demographics below. |
| `page_impressions_by_city_unique`, `page_impressions_by_country_unique`, `page_impressions_by_locale_unique`, `page_impressions_by_story_type*` | Partially covered by `page_fans_city` / `page_fans_country` / `page_fans_locale`, which are *fans*, not *reach* — not equivalent. |
| `page_impressions_frequency_distribution`, `page_impressions_viral_frequency_distribution` | No successor. |
| `page_fans_online`, `page_fans_online_per_day` | No successor (best-time-to-post is dead in the API). |
| `page_places_checkin_total*`, `page_tab_views_*`, `page_views_by_profile_tab_total` | No successor. |

**Wave 2 — 15 November 2025: impressions → views.** Post-level *impressions* were superseded by *views*.

| Removed / deprecated above v25 | Landed instead |
|---|---|
| `post_impressions` | `post_media_view` → `metrics_media_view` |
| `post_impressions_unique` (post reach) | `post_total_media_view_unique` → `metrics_total_media_view_unique` |
| `page_impressions_unique` (page reach) | `page_total_media_view_unique` → `metrics_total_media_view_unique` |

**Wave 3 — 15 June 2026: reach → unique views, across all API versions.** Everything unique-and-broken-out died:

- Page reach breakouts: `page_impressions_paid_unique`, `page_impressions_viral_unique`, `page_impressions_nonviral_unique`.
- The entire `page_posts_impressions*` family (page-level aggregate of post impressions — Total, Unique, Paid, Unique Paid, Organic Unique, Served Organic Unique, Viral, Unique Viral, Non-viral, Unique Non-viral). Individual post impressions survive; the page-level rollup does not. `fbpage_DailyStats` therefore has no `metrics_posts_impressions_*` — compute it from `fbpage_Post` if a client needs it.
- Post reach breakouts: `post_impressions_paid_unique`, `post_impressions_fan_unique`, `post_impressions_organic_unique`, `post_impressions_viral_unique`, `post_impressions_nonviral_unique`.
- Unique video views: `page_video_views_unique`, `post_video_views_unique`, `post_video_views_organic_unique`, `post_video_views_paid_unique`.
- All Story impression metrics, and all `*_video_views_10s*` metrics (those went at v18, April 2024).

**Two consequences to tell clients before they see a chart move:**

1. **Paid vs organic reach can no longer be separated.** `*_total_media_view_unique` has no paid/organic breakout. Total-view metrics (`metrics_media_view`, `metrics_impressions_paid` / `_organic` at post level) still split, unique ones do not.
2. **Unique views ≠ old reach.** Meta counts them differently and aligns to the in-app UI. Expect a step change at the November 2025 / June 2026 boundaries in any long time series. Do **not** stitch `page_impressions_unique` history onto `page_total_media_view_unique` as one continuous line — carry both columns and break the series.

**Legacy columns kept on purpose.** `metrics_impressions` (from `page_impressions` / `post_impressions`) is retained in both `fbpage_DailyStats` and `fbpage_Post` even though it is deprecation-flagged above v25, because (a) historical backfill still returns it for pre-cutover dates and (b) page-level `page_impressions` was still answering at the time of writing. Treat it as **may go NULL at any time** and never make it the sole basis of a headline tile — pair it with `metrics_media_view` and let the mart COALESCE with an explicit era flag.

## Demographics — what is actually available

`fbpage_Demographics` is a tall table (`segments_segment_type`, `segments_segment_value`, `metrics_value`) so new breakdowns land without a schema change. Today only three populate it:

| `segments_segment_type` | Source metric | Status |
|---|---|---|
| `country` | `page_fans_country` | available |
| `city` | `page_fans_city` | available |
| `locale` | `page_fans_locale` | available |
| `age_gender` | *(none)* | **not available** — `page_fans_gender_age` was removed September 2024 and has no API successor. Meta Business Suite still shows it in the UI; the API does not return it. |

The `age_gender` slot is designed in and the column can accept it, but the loader must leave it unpopulated and the dashboard must not present an empty age/gender chart as "no data" — it is "not provided by the platform". `segments_metric_name` carries the raw API metric name so provenance survives.

Note also these are **fans** (people who liked the Page), not **reached users**. The old reach-by-country/city metrics are gone. Do not relabel a fans breakdown as an audience-reached breakdown in a client report.

## Mutability — restated, not immutable

**`fbpage_DailyStats` and `fbpage_Demographics` are effectively immutable once settled, but not immediately.** Meta's day buckets use **Pacific time** regardless of the Page's own timezone, and insights lag: a day's numbers keep moving for roughly 48–72 hours after midnight PT, and video metrics settle slowest. Re-pull a rolling **7-day** window every night and `MERGE` on `(page_id, segments_date, segments_period)` (plus the segment keys for demographics). After 7 days, treat the row as final.

**`fbpage_Post` is not immutable at all.** Post insights are `period=lifetime` cumulative counters — an old post keeps accruing views, reactions and shares indefinitely, and the post body itself can be edited (`post_updated_time` moves), hidden or deleted. The design is a **daily snapshot keyed by `(post_id, _DATA_DATE)`**: latest state is `_DATA_DATE = _LATEST_DATE`, and day-over-day deltas are a `LAG()` over `_DATA_DATE`. Refresh the last **90 days** of posts nightly and the full history weekly, otherwise the rate-limit budget will not survive. Deleted posts simply stop appearing in new snapshots — do not hard-delete history.

**`fbpage_Page` is a pure daily snapshot.** `page_fan_count` and `page_followers_count` are point-in-time counters read at pull time, so the follower series is only as good as the pull schedule — one missed night is one missing point, not a recomputable gap.

## Per-client layout

These tables live **inside each client's dataset**, not in a shared cross-client table:

```
client_<slug>/
  fbpage_Page
  fbpage_DailyStats
  fbpage_Post
  fbpage_Demographics
  meta_*        # paid Facebook/Instagram — Marketing API
  ads_*         # Google Ads
  ga4_*         # GA4
  calls_*       # WildJar / CallRail
```

One dataset per client is the isolation boundary: access control, cost attribution and deletion are all per-dataset, and a client can never see another's rows through a query mistake. A client with two Facebook Pages gets two `page_id` values in the same tables — `page_id` is part of the grain everywhere, so nothing needs restructuring.

Partition `fbpage_DailyStats` and `fbpage_Demographics` on `_DATA_DATE`, `fbpage_Post` on `post_date` (with `_DATA_DATE` as a clustering key), and `fbpage_Page` on `_DATA_DATE`. Cluster on `page_id` throughout.
