-- fact_ads_campaign_daily — the Google Ads mart the dashboard reads.
-- Grain: date × campaign × device × network. BASE INPUTS ONLY (no ratios —
-- CTR/CPC/ROAS etc. are derived downstream in metrics.ts / SQL).
-- Explicit column list on purpose: DTS adds columns over time; additive
-- changes must never break this transform. ${DATASET} is substituted per client.
CREATE OR REPLACE TABLE `${DATASET}.fact_ads_campaign_daily` AS
SELECT
  s.segments_date                       AS date,
  s.campaign_id                         AS campaign_id,
  c.campaign_name                       AS campaign_name,
  c.campaign_advertising_channel_type   AS channel_type,
  c.campaign_status                     AS campaign_status,
  s.segments_device                     AS device,
  s.segments_ad_network_type            AS network,
  SUM(s.metrics_impressions)            AS impressions,
  SUM(s.metrics_clicks)                 AS clicks,
  SUM(s.metrics_interactions)           AS interactions,
  SUM(s.metrics_cost_micros)            AS cost_micros,
  SUM(s.metrics_conversions)            AS conversions,
  SUM(s.metrics_conversions_value)      AS conversions_value,
  SUM(s.metrics_view_through_conversions) AS view_through_conversions
FROM `${DATASET}.ads_CampaignBasicStats` s
JOIN (
  SELECT DISTINCT campaign_id, campaign_name, campaign_advertising_channel_type, campaign_status
  FROM `${DATASET}.ads_Campaign`
  WHERE _DATA_DATE = _LATEST_DATE
) c USING (campaign_id)
GROUP BY 1, 2, 3, 4, 5, 6, 7
