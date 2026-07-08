-- Looker Studio custom SQL — operational
-- datasource_id: 23cf377a-7033-44fb-b67c-a7d49da7dec3
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: passthrough  (обёртка вокруг postgresqldim9000.view_monthly_active_residents)
-- runs(90d): 14   first_seen: 2026-06-11   last_seen: 2026-06-11
-- referenced_tables: postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.EVENTS_407641, postgresqldim9000.users, postgresqldim9000.spaces, postgresqldim9000.houses, postgresqldim9000.space_apartments, postgresqldim9000.space_commercials, postgresqldim9000.space_user
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`complex_name` AS clmn0_, t0.`report_month` AS clmn1_, t0.`total_users` AS clmn2_ FROM `analytics-454817.postgresqldim9000.view_monthly_active_residents` AS t0
