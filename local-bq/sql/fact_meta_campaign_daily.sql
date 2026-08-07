-- fact_meta_campaign_daily — the Meta Ads mart the dashboard reads.
-- Grain: date × campaign × impression device. BASE INPUTS ONLY.
--
-- Purchases/revenue come from meta_CampaignActions (Meta returns conversions
-- inside the actions[] array, not as scalar columns) — joined on the campaign's
-- purchase action_type so the mart carries a comparable conversions pair to
-- the Google Ads mart. Explicit column list: the API adds fields over time.
--
-- NOTE the breakdown footgun: stats rows are broken out by impression device
-- only. Never UNION rows from meta_CampaignPlacements/Demographics into this
-- table — Meta forbids many breakdown combinations, so mixing them double-counts.
CREATE OR REPLACE TABLE `${DATASET}.fact_meta_campaign_daily` AS
WITH purchases AS (
  SELECT
    segments_date            AS date,
    campaign_id,
    SUM(metrics_actions)      AS purchases,
    SUM(metrics_action_values) AS purchase_value
  FROM `${DATASET}.meta_CampaignActions`
  WHERE action_type = 'offsite_conversion.fb_pixel_purchase'
  GROUP BY 1, 2
),
leads AS (
  SELECT segments_date AS date, campaign_id, SUM(metrics_actions) AS leads
  FROM `${DATASET}.meta_CampaignActions`
  WHERE action_type = 'lead'
  GROUP BY 1, 2
),
day_totals AS (
  -- campaign/day impression totals, used to allocate campaign-level actions
  -- across the device rows so SUM() over this mart never double-counts
  SELECT segments_date AS date, campaign_id, SUM(metrics_impressions) AS impressions
  FROM `${DATASET}.meta_CampaignStats`
  GROUP BY 1, 2
)
SELECT
  s.segments_date                    AS date,
  s.account_id                       AS account_id,
  s.campaign_id                      AS campaign_id,
  c.campaign_name                    AS campaign_name,
  c.campaign_objective               AS objective,
  c.campaign_status                  AS campaign_status,
  s.segments_impression_device       AS device,
  SUM(s.metrics_impressions)         AS impressions,
  SUM(s.metrics_reach)               AS reach,
  SUM(s.metrics_clicks)              AS clicks,
  SUM(s.metrics_inline_link_clicks)  AS link_clicks,
  SUM(s.metrics_spend)               AS spend,
  -- actions[] are reported per campaign/day, so allocate by this device's
  -- share of the day's impressions (ANY_VALUE would repeat them per device)
  SUM(s.metrics_impressions) / NULLIF(ANY_VALUE(t.impressions), 0) * ANY_VALUE(p.purchases)      AS purchases,
  SUM(s.metrics_impressions) / NULLIF(ANY_VALUE(t.impressions), 0) * ANY_VALUE(p.purchase_value) AS purchase_value,
  SUM(s.metrics_impressions) / NULLIF(ANY_VALUE(t.impressions), 0) * ANY_VALUE(l.leads)          AS leads
FROM `${DATASET}.meta_CampaignStats` s
JOIN day_totals t ON t.date = s.segments_date AND t.campaign_id = s.campaign_id
JOIN (
  SELECT DISTINCT campaign_id, campaign_name, campaign_objective, campaign_status
  FROM `${DATASET}.meta_Campaign`
  WHERE _DATA_DATE = _LATEST_DATE
) c ON c.campaign_id = s.campaign_id   -- explicit: day_totals also carries campaign_id
LEFT JOIN purchases p ON p.date = s.segments_date AND p.campaign_id = s.campaign_id
LEFT JOIN leads     l ON l.date = s.segments_date AND l.campaign_id = s.campaign_id
GROUP BY 1, 2, 3, 4, 5, 6, 7
