-- fact_calls_daily — the Call Tracking mart.
-- Grain: date × source/medium/campaign × tracking number × status.
--
-- Built from calls_Call (one row per call), NOT from calls_DailyStats — the
-- rollup exists for cheap reads, but deriving from the fact keeps the module
-- honest and lets us add dimensions without re-landing data.
--
-- IMPORTANT: calls_Call is a MERGE-mutable fact, not a daily snapshot. Never
-- filter it with _DATA_DATE = _LATEST_DATE (that pattern belongs to
-- calls_TrackingNumber) — it would drop every historical call.
--
-- Averages are deliberately NOT carried through: rollups must recompute them
-- from the total_* columns, never average an average.
CREATE OR REPLACE TABLE `${DATASET}.fact_calls_daily` AS
SELECT
  call_date                                          AS date,
  account_id,
  COALESCE(attribution_source, '(direct)')           AS source,
  COALESCE(attribution_medium, '(none)')             AS medium,
  COALESCE(attribution_campaign, '(not set)')        AS campaign,
  call_tracking_number                               AS tracking_number,
  outcome_status                                     AS status,
  COUNT(*)                                           AS calls,
  COUNTIF(outcome_is_answered)                       AS answered,
  COUNTIF(outcome_is_missed)                         AS missed,
  COUNTIF(outcome_is_voicemail)                      AS voicemail,
  COUNTIF(outcome_is_abandoned)                      AS abandoned,
  COUNTIF(outcome_is_qualified_lead)                 AS qualified,
  COUNTIF(call_is_first_time_caller)                 AS first_time_callers,
  COUNTIF(call_is_business_hours)                    AS business_hours_calls,
  COUNTIF(call_has_recording)                        AS recorded,
  COUNTIF(call_has_transcript)                       AS transcribed,
  COUNTIF(outcome_sentiment = 'positive')            AS positive_sentiment,
  SUM(call_duration_seconds)                         AS duration_seconds,
  SUM(call_talk_time_seconds)                        AS talk_seconds,
  SUM(call_ring_time_seconds)                        AS ring_seconds,
  SUM(COALESCE(outcome_value, 0))                    AS value
FROM `${DATASET}.calls_Call`
GROUP BY 1, 2, 3, 4, 5, 6, 7
