# Google Ads DTS Schema Replica

Exact replica of the table schemas produced by the **Google Ads Data Transfer Service (DTS)** into BigQuery. Used to seed the local BigQuery emulator with realistic Google Ads tables now, and to validate transforms against the real DTS output in BigQuery later.

## Source

- Column mapping (authoritative): https://docs.cloud.google.com/bigquery/docs/google-ads-transformation (page last updated 2026-07-31 UTC)
- Field types cross-checked against the Google Ads API field reference: https://developers.google.com/google-ads/api/fields/latest/overview

## What's here

- 94 of the 109 documented DTS tables, one JSON file per table (`ads_<TableName>.json`), each a BigQuery-style schema array of `{name, type, mode?}` entries.
- `manifest.json` — index of all tables with `kind` (`snapshot` = Match Table entity snapshot, `stats` = metrics table) and column counts.
- Every table carries the DTS bookkeeping columns `_DATA_DATE` and `_LATEST_DATE` (DATE) appended last.
- Column order matches the transformation doc verbatim, including doc oddities (except duplicated column names, which BigQuery forbids — e.g. `ads_ProductGroupStats` lists `ad_group_criterion_listing_group_case_value_product_brand_value` twice in the doc; it appears once here).

Not included (15 tables): the attribute/label Match Tables (`CampaignCriterion`, `CampaignLabel`, `LocationBasedCampaignCriterion`, `AdGroupBidModifier`, `AdGroupCriterion`, `AdGroupLabel`, `AdGroupCriterionLabel`, `AdGroupAdLabel`) and the Performance Max tables (`Asset`, `AssetGroup`, `AssetGroupAsset`, `AssetGroupSignal`, `AssetGroupListingGroupFilter`, `AssetGroupProductGroupStats`, `CampaignAssetStats`, which DTS creates only if PMax data is enabled).

## Naming convention (real DTS)

Each transfer creates a partitioned table `p_ads_<TableName>_<customer_id>` plus a view `<TableName>_<customer_id>`. The files here use the base name `ads_<TableName>`; the emulator/seed layer appends the customer id.

## Seamless-cutover rule

**Transforms must SELECT explicit column lists — never `SELECT *`.** Google may ADD columns to these tables over time (additive schema changes are expected and documented). Any transform, view, or downstream query that names its columns explicitly keeps working unchanged when new columns appear; `SELECT *` breaks column-position assumptions and downstream schemas. This is what makes the cutover from local emulator to real BigQuery DTS seamless: the replica only needs to be a superset-compatible subset at cutover time.

## Per-client layout

These tables are created **inside each `client_<slug>` dataset** (one dataset per client), mirroring how each client's Google Ads transfer lands in its own dataset in production. The schema files are dataset-agnostic; the seeding script instantiates them per client.

## Notes

- Match Tables (entity snapshots) are attribute-only and are NOT updated by refresh windows or backfills; only stats tables are restated.
- Stats table row grain = ID/attribute key columns plus all `segments_*` columns present in that table; Hourly tables additionally key on `segments_hour`.
