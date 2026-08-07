# LinkedIn Organic (Organization Pages) Schema

BigQuery table schemas for LinkedIn **organic** company-page data — 4 tables, 170 columns, one JSON file per table (`li_<TableName>.json`), each a BigQuery-style schema array of `{name, type, mode}` entries. Used to seed the local BigQuery emulator with realistic LinkedIn data now, and as the contract the production loader must satisfy later.

`manifest.json` indexes all tables with `kind`, `grain` and column counts.

| Table | Kind | Columns | Grain |
|---|---|---|---|
| `li_Organization` | snapshot | 45 | one row per organization per `_DATA_DATE` |
| `li_DailyStats` | stats | 42 | organization × day |
| `li_FollowerStats` | demographics | 15 | organization × segment type × segment value per `_DATA_DATE` |
| `li_Post` | post | 68 | one row per post per `_DATA_DATE` (cumulative lifetime stats) |

**Sponsored LinkedIn activity is not in here.** `organizationalEntityShareStatistics` explicitly "returns organic statistics only" — sponsored impressions, clicks and spend come from the Ad Analytics API and belong in an `li_ads_*` family, not these tables. A LinkedIn post that was later boosted will show its *organic* counts here and its *paid* counts there; the mart must not add them together without a deliberate decision.

## We own these shapes

LinkedIn has **no native BigQuery export**, no BigQuery Data Transfer Service connector, and nothing warehouse-shaped in the Marketing Developer Platform. Everything anyone sells as "LinkedIn → BigQuery" is third-party ETL sitting on the same public versioned REST API we are calling.

So, like `../meta_ads/` and `../call_tracking/`, and unlike `../google_ads/` (a transcription of Google's published DTS mapping), **every table name, column name, type and grain in this directory is a design decision we made.** Nobody upstream will keep it in sync when LinkedIn ships a new API version — that is our job, and it is why the notes below are specific about which API version each field came from.

Field names were verified against the Microsoft Learn Community Management docs at **`Linkedin-Version` moniker `202607`** (the default at time of writing). LinkedIn versions its API monthly by `YYYYMM` header and sunsets versions roughly annually — `202507` is already sunset. Pin one version in the loader, record it, and re-verify this directory whenever you bump it.

## Design rules baked into these files

- **All ids are `STRING`.** LinkedIn post ids such as `urn:li:share:7132564752928563200` are 19 digits — they overflow nothing in `INT64`, but they arrive as URNs and are only ever used as keys, so every one of them is text. `organization_urn` carries the full `urn:li:organization:{id}`; `organization_id` carries the bare numeric id as a string. Same pairing on posts: `post_urn` (full URN), `post_id` (bare id), `post_urn_type` (`share` | `ugcPost`). Never "optimise" any of these to `INT64`.
- **`share` and `ugcPost` URNs are the same posts.** The Posts API returns either type depending on how the post was created, and `organizationalEntityShareStatistics` accepts `shares=` and `ugcPosts=` as separate parameters returning `share` or `ugcPost` on the element. `post_urn` is the natural key; `post_urn_type` tells the loader which parameter to use on the next stats pull.
- **`TIMESTAMP` only where the moment matters.** `post_created`, `post_published` and `post_last_modified` are TIMESTAMPs (LinkedIn returns epoch **milliseconds** — divide by 1000, do not feed milliseconds to a seconds-based constructor). `post_date` is the DATE the post published, in the **client's local timezone**, and is the partition-friendly column dashboards group by. Everything else is DATE.
- **`segments_date` is derived from `timeRange.start`.** All three statistics endpoints return `timeRange: {start, end}` in epoch milliseconds where `start` is the inclusive beginning of the bucket and `end` is exclusive. With `timeGranularityType=DAY` the loader converts `start` to a UTC date — LinkedIn's day boundaries are UTC and are **not** shifted to the client's timezone, so a LinkedIn "day" will not line up perfectly with a GA4 day for an Australian client. Document this in any blended report rather than silently reconciling it.
- **`metrics_engagement` and `metrics_engagement_rate` are both present, deliberately.** `metrics_engagement` is LinkedIn's own `engagement` field (a double: organic clicks + likes + comments + shares over impressions). `metrics_engagement_rate` is **our** recomputation of the same idea from the landed components. They will occasionally disagree, because LinkedIn's numerator includes reactions the component fields do not decompose; keeping both makes the discrepancy visible instead of invisible. `metrics_total_engagements` and `metrics_click_through_rate` are likewise derived by us, not returned by the API.
- **`metrics_like_count` can be negative.** Documented behaviour: when a member who liked a *sponsored* share later unlikes it, the like was never counted as organic but the unlike is. Do not add a `CHECK`-style assumption of non-negativity, and do not clamp it at zero on ingest — clamp it at presentation time if a client finds it confusing.
- **Follower demographics are lifetime-only and organic+paid are rolled together.** LinkedIn is explicit: for the professional demographic facets, "results are rolled up as a total of both organic and paid followers in the `organicFollowerCount` field. Do not refer to the `paidFollowerCount` field." So in `li_FollowerStats`, `metrics_organic_follower_count` is really *total* followers for that segment and `metrics_paid_follower_count` will be `0`. `metrics_total_follower_count` is our own copy of the honest number. `metrics_follower_share` and `metrics_segment_rank` are derived by us within each facet.
- **Follower *gains* are time-bound and cannot be segmented.** Adding `timeIntervals` to `organizationalEntityFollowerStatistics` returns `followerGains.organicFollowerGain` / `paidFollowerGain` only — no demographic breakdown at all (`followerCountsByFunction`, `ByStaffCountRange`, `ByGeo`, `ByGeoCountry` are explicitly unsupported with a time range). That is why gains live in `li_DailyStats` and breakdowns live in `li_FollowerStats`, and why "new followers by industry this month" is a question LinkedIn's API **cannot** answer. Do not build a dashboard tile that implies otherwise.
- **`li_Organization.metrics_follower_count` comes from a different endpoint than the rest of the table.** `organizationalEntityFollowerStatistics` no longer returns `totalFollowerCounts`; total followers now come from `GET /rest/networkSizes/{orgUrn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, which returns `{"firstDegreeSize": N}`. `li_DailyStats.metrics_follower_count` carries the same level so follower-count-over-time charts are one scan, but it is only populated for days on which we actually ran — it is **NULL for any date before we started collecting**, because LinkedIn will not backfill a historical follower level.
- **The `_json` and `_url` columns are enrichment, not raw fields.** `li_logo_url` / `li_cover_photo_url` require a second call to the Images API to resolve `logoV2.original` (a `urn:li:digitalmediaAsset:…`) into a `downloadUrl`; the URN itself is landed alongside in `li_logo_urn` / `li_cover_photo_urn` so the row is still useful if that call is skipped. `li_page_url` is composed as `https://www.linkedin.com/company/{vanityName}/`; `post_permalink` as `https://www.linkedin.com/feed/update/{post_urn}/`. `li_locations_json` and `post_target_entities_json` land nested structures as JSON `STRING` rather than dropping them, matching the `../meta_ads/` convention.
- **`li_staff_count_range_min` / `_max` are our expansion** of the `SIZE_1` … `SIZE_10001_OR_MORE` enum into integers so the dashboard can sort company sizes correctly. The raw enum is preserved in `li_staff_count_range`.
- **`li_is_admin_access` records whether the token had `ADMINISTRATOR` on that org.** Without it, `GET /rest/organizations/{id}` returns only `id`, `name`, `localizedName`, `localizedWebsite`, `vanityName`, `logoV2`, `locations`, `primaryOrganizationType` — every other `li_*` attribute lands NULL. That flag is the difference between "the client has no description" and "we could not see it".
- **Segment values are landed three ways.** `segments_value_urn` is the raw URN (`urn:li:seniority:2`, `urn:li:industry:96`, `urn:li:geo:103644278`), `segments_value` is the bare id or enum literal, and `segments_value_name` is the human-readable label resolved against LinkedIn's Standardized Data reference. Resolve once into a lookup at ingest — the dashboard must never render `urn:li:function:22` at a client.
- **REPEATED fields, and the dummy generator must emit real JSON arrays for them:**
  - `li_Organization`: `li_alternative_names`, `li_industry_names`, `li_industry_urns`, `li_localized_specialties`
  - `li_Post`: `post_hashtags`, `post_media_urns`, `post_mentioned_organization_urns`, `post_poll_options`, `post_third_party_distribution_channels`
  - `li_DailyStats` and `li_FollowerStats` have none.
- **`post_hashtags` and `post_mentioned_organization_urns` are parsed, not fetched.** LinkedIn returns `commentary` in *little text format*: mentions come back as `@[Devtestco](urn:li:organization:2414183)` and hashtags as `{hashtag|\#|coding}`. The loader extracts both into the REPEATED columns and stores the raw commentary verbatim in `post_text`. Do not strip the templates from `post_text` — round-tripping an edit back to LinkedIn needs them.
- **`_DATA_DATE` and `_LATEST_DATE` (DATE) are appended last on every table**, same bookkeeping semantics as the other families. `li_Organization` and `li_FollowerStats` are daily snapshots: filter `_DATA_DATE = _LATEST_DATE` for current state. `li_DailyStats` carries `_DATA_DATE = segments_date`.
- **Transforms must SELECT explicit column lists — never `SELECT *`.** Same seamless-cutover rule as the other replicas.

## Ingestion

**REST pull per account per day.** There is no export, no webhook, no push. Every run is a fan-out of GETs against `https://api.linkedin.com/rest/…` with three mandatory headers: `Authorization: Bearer {token}`, `Linkedin-Version: {YYYYMM}`, `X-Restli-Protocol-Version: 2.0.0`.

Per organization, per run:

| Table | Call |
|---|---|
| `li_Organization` | `GET /rest/organizations/{id}` + `GET /rest/networkSizes/{orgUrn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER` |
| `li_DailyStats` | `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity={urn}&timeIntervals=(timeRange:(start,end),timeGranularityType:DAY)` + the same shape against `organizationPageStatistics?q=organization` + `organizationalEntityFollowerStatistics?q=organizationalEntity` |
| `li_FollowerStats` | `GET /rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity={urn}` (**no** `timeIntervals`) |
| `li_Post` | `GET /rest/posts?q=author&author={urn}&count=100&sortBy=CREATED` (paginate), then `organizationalEntityShareStatistics` with `shares=List(…)` / `ugcPosts=List(…)` batched, then `GET /rest/socialMetadata?ids=List(…)` batched |

**Tokens and permissions — the real constraint on this integration.**

- LinkedIn requires **3-legged OAuth**: a human admin of the client's Company Page must click through consent. There is no service-account or app-only path to organization statistics. Compare Meta, where a Page access token with `read_insights` is enough; LinkedIn is strictly harder to onboard.
- Scopes needed: **`rw_organization_admin`** for `organizationalEntityFollowerStatistics`, `organizationalEntityShareStatistics`, `organizationPageStatistics` and the admin fields of the Organization lookup; **`r_organization_social`** for the Posts API finder; **`r_organization_social_feed`** for `socialMetadata`. The authenticated member must hold the `ADMINISTRATOR` role (or `DIRECT_SPONSORED_CONTENT_POSTER` / `CONTENT_ADMIN` where noted) on that specific page — insufficient role returns `403`, not an empty result.
- **Access tokens expire in 60 days and refresh tokens in 365 days**, and refresh tokens are only issued to approved apps. Budget for a yearly re-consent ritual with every client, and alert on `401` well before it fires.
- The app itself must be approved for the **Community Management API** product; without it these endpoints 403 regardless of scope.
- Store one token per client, never a shared one. A single token that administers ten pages is one revocation away from ten broken dashboards, and it makes per-client access auditing impossible.

**Rate limits.** LinkedIn's limits are **per-application per day and per-member per day, resetting at UTC midnight**, and the standard per-endpoint numbers are **not published** — you look them up in the Developer Portal Analytics tab, which only shows endpoints you have already called at least once today. Exceeding a limit returns `429`. Developer admins get an email at 75% of an application-level quota, delayed 1–2 hours, and only for application-level breaches.

Practical consequences for the loader:

- **The per-post fan-out is the risk, not the daily aggregates.** Three calls a day per org for `li_DailyStats` is nothing; a client with 400 historical posts refreshed daily is hundreds of calls. Batch aggressively — `shares=List(…)` and `socialMetadata?ids=List(…)` take multiple URNs per call — and **tier the refresh**: posts from the last 30 days daily, 31–90 days weekly, older than 90 days monthly. LinkedIn post engagement is effectively dead after a fortnight.
- Run per-client, sequentially, with jitter; a burst across all clients at 00:05 UTC is the fastest way to discover a limit you cannot see.
- Treat `429` as backoff-and-retry-tomorrow, not backoff-and-retry-in-a-minute — these are daily buckets, not sliding windows.
- Log the `Linkedin-Version` used on every run alongside `_DATA_DATE`. When a version sunsets mid-quarter, that log is how you find which rows came from which contract.

**The 12-month wall.** `organizationalEntityShareStatistics` returns data only within a **rolling 12-month window**, and time-bound follower statistics run from 12 months before the request date to **2 days before** it. So:

- There is **no** first-run backfill beyond 12 months, ever. Year-on-year comparison only becomes possible once *we* have been landing data for 13 months — the warehouse is the only place that history will exist.
- The last two days of follower gains are simply not available yet. Do not treat a zero on yesterday as a real zero; land NULL and let the trailing re-pull fill it.
- Backfill on client onboarding is a one-off 12-month pull at `DAY` granularity, chunked into request windows small enough to keep responses sane. Do it before anyone looks at the dashboard.

## Deprecated / superseded — what we deliberately excluded

| Excluded | Replaced by | Why |
|---|---|---|
| `ugcPosts` API | **Posts API** (`/rest/posts`) | LinkedIn: "The Posts API replaces the ugcPosts API." `li_Post` is modelled on the Posts schema (`commentary`, `content`, `distribution`, `lifecycleState`), not the older `specificContent` / `shareCommentary` shape. |
| `socialActions` endpoint — `likesSummary.totalLikes`, `aggregatedTotalLikes`, `likedByCurrentUser` | **`socialMetadata`** — `reactionSummaries.{LIKE,PRAISE,EMPATHY,INTEREST,APPRECIATION,MAYBE}.count`, `commentSummary.count`, `commentSummary.topLevelCount` | The reactions model superseded flat likes. We land each reaction type as its own `metrics_reactions_*` column plus `metrics_reactions_total`; a "likes" tile that silently means "all reactions" is a lie the schema should not enable. `likedByCurrentUser` is meaningless for a service integration. |
| `totalFollowerCounts` on `organizationalEntityFollowerStatistics` | **`networkSizes`** with `edgeType=COMPANY_FOLLOWED_BY_MEMBER` | "This endpoint no longer returns `totalFollowerCounts`." Note the enum spelling changed at v202305 — the older `CompanyFollowedByMember` is **not** retro-compatible and is not used here. |
| `followerCountsByRegion`, `followerCountsByCountry` | **`followerCountsByGeo`**, **`followerCountsByGeoCountry`** | Bing-geo migration. `li_FollowerStats.segments_type` therefore uses `GEO` and `GEO_COUNTRY`, not `REGION` / `COUNTRY`, and `segments_value_urn` holds a `urn:li:geo:{id}`. |
| `pageStatisticsByIndustry`, `pageStatisticsByRegion`, `pageStatisticsByCountry` | **`pageStatisticsByIndustryV2`** (`industryV2` URN), **`ByGeo`**, **`ByGeoCountry`** | Same migration on the page-statistics side. We only land `totalPageStatistics` in `li_DailyStats` — page-view demographics are a facet explosion we do not currently have a dashboard for, and they would double the row count of the daily table. If we add them later they belong in a sibling `li_PageViewStats`, not bolted onto `li_DailyStats`. |
| `commentMentionsCount`, `shareMentionsCount` | — | Present in older `ShareStatisticsData` documentation, absent from the current published schema. Excluded rather than landed as permanently-NULL columns. |
| `careersPageClicks.*` — `careersPageBannerPromoClicks`, `careersPagePromoLinksClicks`, `careersPageEmployeesClicks`, `careersPageJobsClicks` | **`clicks.desktopCustomButtonClickCounts` / `mobileCustomButtonClickCounts`** | The current `totalPageStatistics.clicks` object exposes only the custom-button counts. We land those summed into `metrics_desktop_custom_button_click_count` / `metrics_mobile_custom_button_click_count` / `metrics_custom_button_click_count`. |
| Organization Brand API, `urn:li:organizationBrand:{id}` | **`urn:li:organization:{id}`** | Deprecated Jan 2024; brand URNs now map 1:1 onto organization URNs. No separate brand table, no `brandPageStatistics` path. Showcase pages land as ordinary organizations with `li_parent_organization_urn` set. |
| `Find Organization by Email Domain` finder | — | Discontinued from v202408. Client onboarding resolves an organization by `vanityName` or by the admin's own `organizationAcls`. |
| `schoolAttributes.legacySchool` (`urn:li:school:{id}`) | organization `id` | Flagged for near-term deprecation. `li_is_school` is landed as a boolean; the legacy school URN is not. |
| `locations` targeting facet on `distribution.targetEntities` | **`geoLocations`** | Deprecated in favour of geo URNs. `post_target_entities_json` stores whatever the API returns, but any targeting logic we write uses `geoLocations`. |
| `isDsc` **query parameter** on the posts finder | — | Deprecated; the finder now always returns organic and sponsored together. The **response field** `adContext.isDsc` is still landed as `post_is_dsc` — that is how we separate dark posts and boosted content from genuine organic page activity. Filter `post_is_dsc = FALSE` for organic reporting. |
| Page-view metrics on `brandPageStatistics` | — | Not called. See the organizationBrand row above. |

## Mutability — restated, not immutable

**These metrics are not immutable once landed.** Treat every row as provisional for a window and MERGE, never blind-INSERT.

What moves:

- **Engagement keeps accruing.** `li_Post` statistics are *cumulative lifetime* counts as at `_DATA_DATE`, not daily deltas. A post's impression count on day 1 is a fraction of its count on day 14. Any "daily post engagement" chart must be built by differencing consecutive snapshots in the mart — the API will never hand you a per-day figure for an individual post.
- **`li_DailyStats` is genuinely restated.** LinkedIn continues attributing impressions and engagement to the original bucket day for some time after the fact, so yesterday's row will change. Re-pull a **trailing 7-day window** minimum for share and page statistics.
- **Follower gains have a 2-day lag by design** (data ends 2 days before request date). The trailing window must be at least 3 days for `organizationalEntityFollowerStatistics` or the two most recent days are permanently NULL.
- **`shareCount` will not reconcile between grains.** Documented: time-bound `shareCount` excludes instant reposts while lifetime `shareCount` includes them. `li_DailyStats.metrics_share_count` (time-bound) summed over a period will therefore be lower than `li_Post.metrics_share_count` summed over the same posts. This is expected; do not "fix" it in the loader.
- **`socialActions`-derived counts run ahead of statistics counts.** LinkedIn notes that the social endpoints give "up-to-date counts of likes and comments that match the LinkedIn feed", while the statistics endpoint lags. So `metrics_comment_summary_count` and `metrics_reactions_total` on `li_Post` will usually exceed `metrics_comment_count` and `metrics_like_count` on the same row. Pick one family per tile and label it; never mix them in a single number.
- **Post content itself mutates.** `lastModifiedAt` moves when an author edits, and `lifecycleStateInfo.isEditedByAuthor` flips to true (landed as `post_is_edited_by_author`). Deleted posts vanish from the finder entirely — they do **not** return a tombstone. Rows for posts that stop appearing are retained at their last known `_DATA_DATE` and simply stop getting new snapshots; the mart infers deletion from absence.

Therefore:

- **`MERGE` on `(organization_id, segments_date)` for `li_DailyStats`** and on `(post_urn, _DATA_DATE)` for `li_Post`.
- `li_Organization` and `li_FollowerStats` snapshot rows are **not** restated — each day's rows are immutable once written. That is what makes follower-mix drift over time a queryable thing.
- Expect a LinkedIn report run today to differ from the same report run next week. Report "as at" dates on client-facing outputs.

## Per-client layout

These tables are created **inside each `client_<slug>` dataset**, alongside that client's other sources — one dataset per client, all sources together:

```
client_aqua_pulse_spas/
  ads_Campaign, ads_CampaignStats, …          (Google Ads DTS replica)
  meta_Campaign, meta_CampaignStats, …        (Meta Ads)
  events_YYYYMMDD, users_YYYYMMDD, …          (GA4 native export)
  calls_Call, calls_TrackingNumber, …         (WildJar / CallRail)
  li_Organization, li_DailyStats,
  li_FollowerStats, li_Post                   (this directory)
```

The schema files are dataset-agnostic; the seeding script instantiates them per client. A client with no LinkedIn page simply has empty tables — the dashboard hides the module rather than branching.

`organization_id` is carried on every table even though a client dataset normally holds exactly one organization. Showcase pages and acquired brands mean a client can legitimately have several (linked by `li_parent_organization_urn`), and the column costs nothing.

Cross-source blending happens in the mart layer above these raw tables. The joins that matter: `li_Post.post_permalink` → GA4 `page_referrer` / `session_source = 'linkedin'` for click-through attribution, and `li_Post.post_urn` → the LinkedIn Ads creative reference when an organic post was later sponsored, which is the only way to show organic and paid performance of the same creative side by side.

## Partitioning and clustering (production)

| Table | Partition | Cluster |
|---|---|---|
| `li_Organization` | `_DATA_DATE` | `(organization_id)` |
| `li_DailyStats` | `segments_date` | `(organization_id)` |
| `li_FollowerStats` | `_DATA_DATE` | `(organization_id, segments_type)` |
| `li_Post` | `_DATA_DATE` | `(organization_id, post_date)` |

Volumes are small — a busy B2B client posts a few times a week and has a few thousand followers — so nothing here needs narrowing. `li_Post` is the only table that grows with both posts *and* days, and at one snapshot per post per day a client with 500 posts over three years is still well under a million rows. If it ever bites, drop the snapshot cadence for old posts before you split the table.
