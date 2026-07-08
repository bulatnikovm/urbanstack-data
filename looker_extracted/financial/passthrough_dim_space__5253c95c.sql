-- Looker Studio custom SQL — financial
-- datasource_id: 5253c95c-1ece-44c7-bee4-d0e7167d3a8f
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.dim_space)
-- runs(90d): 678   first_seen: 2026-04-09   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.space_commercials, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.space_apartments, postgresqldim9000.spaces, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`building_number` AS clmn0_, t0.`complex_name` AS clmn1_, t0.`property_kind_ua` AS clmn2_, t0.`space_updated_at` AS clmn3_ FROM `analytics-454817.finance_dash.dim_space` AS t0
