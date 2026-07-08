-- Looker Studio custom SQL — product
-- datasource_id: c9b60582-e90e-422a-b13e-588aab9bcc83
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: passthrough  (обёртка вокруг postgresqldim9000.vw_dm_operations_monthly)
-- runs(90d): 505   first_seen: 2026-06-11   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.space_user, postgresqldim9000.space_apartments, postgresqldim9000.space_commercials, postgresqldim9000.EVENTS_407641, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.users, postgresqldim9000.spaces, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`complex_name` AS clmn0_, t0.`report_month` AS clmn1_, t0.`total_users` AS clmn2_ FROM `analytics-454817.postgresqldim9000.vw_dm_operations_monthly` AS t0
