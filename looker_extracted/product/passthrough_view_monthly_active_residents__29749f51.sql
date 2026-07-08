-- Looker Studio custom SQL — product
-- datasource_id: 29749f51-4319-4e1b-850c-f95462a73e9f
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: passthrough  (обёртка вокруг postgresqldim9000.view_monthly_active_residents)
-- runs(90d): 290   first_seen: 2026-06-01   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.users, postgresqldim9000.spaces, postgresqldim9000.houses, postgresqldim9000.EVENTS_407641, postgresqldim9000.space_user, postgresqldim9000.space_apartments, postgresqldim9000.space_commercials
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`confirmed_users` AS clmn0_, t0.`report_month` AS clmn1_, t0.`total_users` AS clmn2_, t0.`visitors_mau` AS clmn3_ FROM `analytics-454817.postgresqldim9000.view_monthly_active_residents` AS t0
