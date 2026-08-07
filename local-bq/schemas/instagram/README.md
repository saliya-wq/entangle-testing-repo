# Instagram (organic) — BigQuery landing schemas

Landing-table shapes for **organic Instagram** performance, sourced from the
**Instagram Platform API** (Instagram Graph API via Facebook Login, or the Instagram API
with Instagram Login). Four tables:

| Table | Kind | Grain |
|---|---|---|
| `ig_Account` | snapshot | account × pull day |
| `ig_DailyStats` | stats | account × day |
| `ig_Media` | post | media × pull day |
| `ig_Demographics` | demographics | account × pull day × metric × segment_type × segment_value |

## There is no native BigQuery export — we own these shapes

Unlike Google Ads (BigQuery Data Transfer Service) or GA4 (native BQ export), Meta ships
**no** first-party BigQuery connector for Instagram. Everything here is a REST pull we write
ourselves, so **these column names are our contract**, not Meta's. They are modelled as
closely as possible on the actual API field/metric strings so the mapping layer stays thin:

- API field/metric name → `metrics_<api_name>` for measures, `segments_*` for dimensions,
  `ig_*` for account attributes, `post_*` for media attributes.
- Where a metric has an API **breakdown**, the breakdown is flattened into sibling columns
  named `metrics_<metric>_<breakdown_value>` (e.g. `metrics_views_reel`,
  `metrics_profile_links_taps_call`, `metrics_navigation_tap_exit`). The un-suffixed column
  is always the `total_value`.
- All ids are `STRING`. Instagram ids (`17841400000000000`-style) exceed safe INT64/JS
  handling and are opaque — **never** land them as INT64.
- Publish moments are `TIMESTAMP` with a partition-friendly `DATE` sibling:
  `ig_Media.post_timestamp` (the API's `timestamp` field, UTC) is paired with
  `ig_Media.post_date`, the same moment truncated to a date. Filter and partition on
  `post_date`, and use `post_timestamp` only when time-of-day matters. This mirrors
  `fbpage_Post.post_created_time`/`post_date` and `li_Post.post_published`/`post_date`, so a
  cross-platform post mart can `UNION` on `post_date` without per-platform casting.
- Every table carries `ig_user_id` and ends with `_DATA_DATE` then `_LATEST_DATE`.
  Snapshot/post tables are filtered `_DATA_DATE = _LATEST_DATE` for current state;
  `ig_DailyStats` rows carry `_DATA_DATE` = the stat date (`segments_date` mirrors it).

### REPEATED fields

`ig_Media` has two `REPEATED` STRING columns — the dummy generator must emit **real JSON
arrays**, not comma-joined strings:

- `post_children_ids` — child media ids of a `CAROUSEL_ALBUM` (empty array otherwise)
- `post_collaborator_usernames` — accepted collaborators on the media

## The `impressions` → `views` migration (read this)

Meta reworked the Instagram insights metric set across v18.0–v22.0. The headline change:
**`impressions` is gone and `views` is the primary consumption metric**, at both account and
media level. `views` counts plays/views of the media on Instagram and supports
`follower_type` and `media_product_type` breakdowns that `impressions` never had.

Deprecated metrics we deliberately **excluded**, and what replaced them:

| Excluded (deprecated) | Level | Sunset | Replacement in these schemas |
|---|---|---|---|
| `impressions` | user + media | v22.0, all versions 21 Apr 2025 | `metrics_views` |
| `plays` | media | v22.0, all versions 21 Apr 2025 | `metrics_views` |
| `clips_replays_count` | media (reels) | v22.0, all versions 21 Apr 2025 | `metrics_views` |
| `ig_reels_aggregated_all_plays_count` | media (reels) | v22.0, all versions 21 Apr 2025 | `metrics_views` / `metrics_crossposted_views` |
| `video_views` | media (video) | v21.0, all versions 8 Jan 2025 | `metrics_views` |
| `engagement` | media | v18.0, all versions 11 Dec 2023 | `metrics_total_interactions` |
| `profile_views` | user | v21.0, all versions 8 Jan 2025 | **no direct replacement.** Nearest signals: `metrics_accounts_engaged` (account level) and `metrics_profile_visits` (media level, per-post). |
| `website_clicks` | user | v21.0, all versions 8 Jan 2025 | `metrics_profile_links_taps` (+ `contact_button_type` breakdown columns); per-post bio-link taps land in `metrics_profile_activity_bio_link_clicked` |
| `email_contacts`, `phone_call_clicks`, `text_message_clicks`, `get_directions_clicks` | user | v21.0, all versions 8 Jan 2025 | `metrics_profile_links_taps_email` / `_call` / `_text` / `_direction` |
| `follower_count` (insight) | user | curtailed to 30-day window from v9.0 | `metrics_follows` / `metrics_unfollows` / `metrics_net_follower_change` from `follows_and_unfollows`, plus `metrics_followers_count` read off the IG User node each day |
| `audience_gender_age`, `audience_country`, `audience_city`, `audience_locale` | user | v18.0, all versions 11 Dec 2023 | `ig_Demographics` rows sourced from `follower_demographics` / `engaged_audience_demographics` with `breakdown` = `age`/`city`/`country`/`gender` |
| `taps_forward`, `taps_back`, `exits` | media (story) | v18.0, all versions 11 Dec 2023 | `metrics_navigation` + `metrics_navigation_tap_forward` / `_tap_back` / `_tap_exit` / `_swipe_forward` (breakdown `story_navigation_action_type`) |
| `carousel_album_impressions`, `carousel_album_reach`, `carousel_album_engagement`, `carousel_album_saved`, `carousel_album_video_views` | media | v18.0, all versions 11 Dec 2023 | the plain `reach` / `views` / `saved` / `total_interactions` metrics now cover carousels |

**Notes on naming inconsistencies in Meta's own API** (we keep the API spelling per level, so
mapping stays 1:1):

- Account level uses **`saves`** → `ig_DailyStats.metrics_saves`.
  Media level uses **`saved`** → `ig_Media.metrics_saved`. Same concept, different string.
- `follower_demographics` supports the `locale` idea only historically; the **current**
  breakdowns are `age`, `city`, `country`, `gender`. `segments_segment_type` is a STRING so
  `locale` rows can be landed if Meta reinstates it, but the connector will not emit them today.
- `contact_button_type` values are `BOOK_NOW`, `CALL`, `DIRECTION`, `EMAIL`,
  `INSTANT_EXPERIENCE`, `TEXT`, `UNDEFINED` — there is **no `WEBSITE` value**; generic
  bio/website taps fall into `UNDEFINED` at account level.
- `follow_type` / `follower_type` values: `FOLLOWER`, `NON_FOLLOWER`, `UNKNOWN`.
- `media_product_type` values: `POST`, `REEL`, `STORY`, `CAROUSEL_CONTAINER`, `AD`.
- `profile_activity` `action_type` values: `BIO_LINK_CLICKED`, `CALL`, `DIRECTION`, `EMAIL`,
  `TEXT`, `OTHER`.
- `ig_reels_avg_watch_time` and `ig_reels_video_view_total_time` are in **milliseconds**.
  Average is `FLOAT64`, total is `INT64`.
- `reels_skip_rate` is a percentage → `FLOAT64`.

## Ingestion

**Shape:** REST pull, per account, per day. One scheduled job per client that:

1. `GET /{ig-user-id}?fields=id,user_id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,shopping_product_tag_eligibility`
   → one `ig_Account` row, `_DATA_DATE` = run date. (`account_type` comes from
   `GET /me?fields=account_type` on the Instagram-Login flavour of the API.)
2. `GET /{ig-user-id}/insights?metric=reach,views,accounts_engaged,total_interactions,likes,comments,saves,shares,replies,reposts,profile_links_taps,follows_and_unfollows&period=day&metric_type=total_value&since=&until=`
   plus repeat calls with `breakdown=follow_type|follower_type|media_product_type|contact_button_type`
   → one `ig_DailyStats` row per day. Meta returns a max **30-day** window per call; backfill in
   30-day pages.
3. `GET /{ig-user-id}/media` (and `/stories`) → media nodes, then
   `GET /{ig-media-id}/insights?metric=...` per media with the metric list appropriate to its
   `media_product_type` (feed / reels / story sets differ — asking for a metric a media type
   does not support returns an error, so branch on `media_product_type`). → `ig_Media`.
4. `GET /{ig-user-id}/insights?metric=follower_demographics,engaged_audience_demographics&period=lifetime&metric_type=total_value&timeframe=this_week&breakdown=age|city|country|gender`
   → fan out to `ig_Demographics` rows.

**Tokens and permissions**

- **Instagram API with Facebook Login (Instagram Graph API):** a **Page access token** for the
  Facebook Page linked to the IG professional account, with `instagram_basic`,
  `instagram_manage_insights`, `pages_show_list` and `pages_read_engagement`.
  This is the same token family Meta Ads / Facebook Page ingestion uses.
- **Instagram API with Instagram Login:** an Instagram user access token with
  `instagram_business_basic` and `instagram_business_manage_insights`. No Facebook Page required.
- Tokens are long-lived (60 days) and must be refreshed on a schedule; a dead token is the
  single most common cause of a silent gap in these tables.
- For comparison: LinkedIn organic needs `r_organization_social` / `rw_organization_admin`;
  Facebook Page needs a Page token with `read_insights`.

**Rate limits**

- Instagram Platform: `calls within 24 hours = 4800 × number of impressions` (impressions =
  content views in the last 24h). Small accounts therefore have a **small** budget — a client
  with low reach can be throttled by a naive per-media insights loop.
- Practical rules: batch media insight calls, cache media nodes and only re-pull insights for
  media newer than ~30 days, and never re-scan the full media history on every run.
- Account-level insights only return data for accounts with **≥100 followers** for some metrics;
  below that, expect NULLs rather than zeros.
- `replies` (story) returns `0` for viewers in Europe and Japan.

## Restatement: are these numbers immutable once landed?

**No — treat recent rows as provisional.**

- `ig_DailyStats`: account-level day metrics can be restated by Meta for roughly **72 hours**
  after the day closes (late-arriving events, de-duplication of reach). Re-pull a rolling
  **7-day** window on every run and overwrite by `(ig_user_id, segments_date)`. Older than that,
  treat as final.
- `ig_Media`: media insights are **lifetime cumulative and keep moving** — a reel posted today
  is still accruing `views` next month. This is why `ig_Media` is a daily snapshot
  (`post_id × _DATA_DATE`) rather than an immutable fact: the same post has a different row
  each day. Use `_DATA_DATE = _LATEST_DATE` for "current totals", or diff consecutive
  `_DATA_DATE`s for a per-day delta. Stories expire after 24h — their insights must be captured
  within the window or they are lost permanently.
- `ig_Account` and `ig_Demographics`: pure snapshots, no restatement — each pull is the truth
  as at `_DATA_DATE`.

## Per-client layout

These tables live **inside each client's dataset**, alongside the other sources:

```
client_<slug>/
  ads_*            Google Ads (BQ Data Transfer replica)
  meta_*           Meta Ads
  ga4_*            GA4
  calls_*          call tracking
  ig_Account
  ig_DailyStats
  ig_Media
  ig_Demographics
```

There is no `client_id` / `account_slug` column — dataset name *is* the tenant boundary, matching
the existing `ads_*` and `meta_*` replicas. `ig_user_id` disambiguates multiple IG accounts held
by the same client within one dataset.

## Sources

- https://developers.facebook.com/docs/instagram-platform/insights
- https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/
- https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user
- https://developers.facebook.com/docs/instagram-platform/reference/instagram-media
- https://developers.facebook.com/docs/instagram-platform/changelog
- https://developers.facebook.com/docs/instagram-platform/overview/
