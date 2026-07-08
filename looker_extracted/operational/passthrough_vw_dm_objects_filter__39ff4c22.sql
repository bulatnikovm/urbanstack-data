-- Looker Studio custom SQL — operational
-- datasource_id: 39ff4c22-f42e-4603-a9b2-b8f4ee149ad4
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: passthrough  (обёртка вокруг postgresqldim9000.vw_dm_objects_filter)
-- runs(90d): 35   first_seen: 2026-06-12   last_seen: 2026-06-13
-- referenced_tables: postgresqldim9000.space_apartments, postgresqldim9000.space_user, postgresqldim9000.sections, postgresqldim9000.space_commercials, postgresqldim9000.complexes, postgresqldim9000.spaces, postgresqldim9000.users, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`active_accounts` AS clmn0_, t0.`complex_name` AS clmn1_, t0.`report_month` AS clmn2_ FROM `analytics-454817.postgresqldim9000.vw_dm_objects_filter` AS t0
