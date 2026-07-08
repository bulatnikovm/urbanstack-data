-- Looker Studio custom SQL — financial
-- datasource_id: af0c8c37-4280-4c96-ae10-7958d7d6cf48
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.dim_llc)
-- runs(90d): 1   first_seen: 2026-04-10   last_seen: 2026-04-10
-- referenced_tables: postgresqldim9000.tascombank_merchants
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`llc_name` AS clmn0_ FROM `analytics-454817.finance_dash.dim_llc` AS t0
