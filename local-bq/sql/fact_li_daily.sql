-- fact_li_daily — LinkedIn (organic) mart. Grain: date.
-- LinkedIn's distinctive angle is B2B audience composition + page views;
-- follower breakdowns stay in li_FollowerStats (queried directly by the module).
CREATE OR REPLACE TABLE `${DATASET}.fact_li_daily` AS
SELECT
  segments_date                              AS date,
  organization_id,
  ANY_VALUE(organization_name)               AS organization_name,
  SUM(metrics_impression_count)              AS impressions,
  SUM(metrics_unique_impressions_count)      AS unique_impressions,
  SUM(metrics_click_count)                   AS clicks,
  SUM(metrics_like_count)                    AS likes,
  SUM(metrics_comment_count)                 AS comments,
  SUM(metrics_share_count)                   AS shares,
  SUM(metrics_total_engagements)             AS engagements,
  SUM(metrics_all_page_views)                AS page_views,
  SUM(metrics_careers_page_views)            AS careers_page_views,
  SUM(metrics_organic_follower_gain)         AS organic_follower_gain,
  SUM(metrics_paid_follower_gain)            AS paid_follower_gain,
  MAX(metrics_follower_count)                AS followers
FROM `${DATASET}.li_DailyStats`
GROUP BY 1, 2
