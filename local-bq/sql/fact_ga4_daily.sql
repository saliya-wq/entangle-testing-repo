-- fact_ga4_daily — the Web Analytics mart.
-- Grain: date × channel (source/medium/campaign) × device.
--
-- This is where GA4's shape bites: metrics are not columns. Sessions come from
-- counting distinct ga_session_id pulled out of the REPEATED event_params
-- record; engagement from the session_engaged param; revenue from the
-- ecommerce record on purchase events. The scalar-subquery UNNEST below is the
-- canonical GA4 idiom (a cross-join UNNEST would multiply rows).
--
-- CUTOVER: locally this reads one ga4_events table. With the real export it
-- becomes  FROM `analytics_<propertyId>.events_*`  with a
-- _TABLE_SUFFIX BETWEEN predicate — kept on its own line so the swap is a
-- two-line diff. The row schema is identical.
CREATE OR REPLACE TABLE `${DATASET}.fact_ga4_daily` AS
WITH ev AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date)                                                    AS date,
    event_name,
    user_pseudo_id,
    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_id')   AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'session_engaged') AS session_engaged,
    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_msec,
    COALESCE(device.category, '(not set)')        AS device,
    COALESCE(traffic_source.source, '(direct)')   AS source,
    COALESCE(traffic_source.medium, '(none)')     AS medium,
    COALESCE(traffic_source.name, '(not set)')    AS campaign,
    ecommerce.purchase_revenue                    AS purchase_revenue
  FROM `${DATASET}.ga4_events`
)
SELECT
  date,
  source,
  medium,
  campaign,
  device,
  -- GA4's default channel grouping, derived (it is a UI dimension, not a column)
  CASE
    WHEN medium = 'organic'                        THEN 'Organic Search'
    WHEN medium IN ('cpc', 'ppc', 'paid')          THEN 'Paid Search'
    WHEN medium = 'paid_social'                    THEN 'Paid Social'
    WHEN medium = 'email'                          THEN 'Email'
    WHEN medium = 'referral'                       THEN 'Referral'
    WHEN source = '(direct)'                       THEN 'Direct'
    ELSE 'Other'
  END                                                                       AS channel_group,
  COUNT(DISTINCT CONCAT(user_pseudo_id, '-', CAST(session_id AS STRING)))   AS sessions,
  COUNT(DISTINCT user_pseudo_id)                                            AS users,
  COUNT(DISTINCT IF(session_engaged = '1', CONCAT(user_pseudo_id, '-', CAST(session_id AS STRING)), NULL)) AS engaged_sessions,
  SUM(COALESCE(engagement_msec, 0))                                         AS engagement_msec,
  COUNTIF(event_name = 'page_view')                                         AS page_views,
  COUNTIF(event_name = 'view_item')                                         AS view_items,
  COUNTIF(event_name = 'add_to_cart')                                       AS add_to_carts,
  COUNTIF(event_name = 'begin_checkout')                                    AS checkouts,
  COUNTIF(event_name = 'purchase')                                          AS purchases,
  COUNTIF(event_name = 'generate_lead')                                     AS leads,
  SUM(IF(event_name = 'purchase', COALESCE(purchase_revenue, 0), 0))        AS revenue
FROM ev
GROUP BY 1, 2, 3, 4, 5, 6
