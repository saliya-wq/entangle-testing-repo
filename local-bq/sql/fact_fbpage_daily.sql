-- fact_fbpage_daily — Facebook Page (organic) mart. Grain: date.
-- Organic has no spend; the story is reach, engagement and follower growth.
-- Only metrics that SURVIVED Meta's 2024 Page Insights pruning are modelled.
CREATE OR REPLACE TABLE `${DATASET}.fact_fbpage_daily` AS
SELECT
  segments_date                              AS date,
  page_id,
  ANY_VALUE(page_name)                       AS page_name,
  SUM(metrics_impressions)                   AS impressions,
  SUM(metrics_views_total)                   AS page_views,
  SUM(metrics_post_engagements)              AS engagements,
  SUM(metrics_post_reactions_total)          AS reactions,
  SUM(metrics_video_views)                   AS video_views,
  SUM(metrics_fan_adds)                      AS fan_adds,
  SUM(metrics_fan_removes)                   AS fan_removes,
  SUM(metrics_fan_adds) - SUM(metrics_fan_removes) AS net_new_fans,
  MAX(metrics_fans)                          AS fans,
  MAX(metrics_lifetime_engaged_followers_unique) AS engaged_followers
FROM `${DATASET}.fbpage_DailyStats`
GROUP BY 1, 2
