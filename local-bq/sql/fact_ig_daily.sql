-- fact_ig_daily — Instagram (organic) mart. Grain: date.
-- Uses Instagram's CURRENT vocabulary: views replaced impressions, and reach
-- splits follower vs non-follower (the reach-source question that matters).
CREATE OR REPLACE TABLE `${DATASET}.fact_ig_daily` AS
SELECT
  segments_date                        AS date,
  ig_user_id,
  ANY_VALUE(ig_username)               AS username,
  SUM(metrics_reach)                   AS reach,
  SUM(metrics_reach_follower)          AS reach_follower,
  SUM(metrics_reach_non_follower)      AS reach_non_follower,
  SUM(metrics_views)                   AS views,
  SUM(metrics_views_reel)              AS views_reel,
  SUM(metrics_views_post)              AS views_post,
  SUM(metrics_views_story)             AS views_story,
  SUM(metrics_accounts_engaged)        AS accounts_engaged,
  SUM(metrics_total_interactions)      AS interactions,
  SUM(metrics_likes)                   AS likes,
  SUM(metrics_comments)                AS comments,
  SUM(metrics_saves)                   AS saves,
  SUM(metrics_shares)                  AS shares,
  SUM(metrics_follows)                 AS follows,
  SUM(metrics_unfollows)               AS unfollows,
  SUM(metrics_net_follower_change)     AS net_follower_change,
  SUM(metrics_profile_links_taps)      AS profile_link_taps,
  MAX(metrics_followers_count)         AS followers
FROM `${DATASET}.ig_DailyStats`
GROUP BY 1, 2
