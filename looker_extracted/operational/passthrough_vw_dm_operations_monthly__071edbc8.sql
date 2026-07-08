-- Looker Studio custom SQL — operational
-- datasource_id: 071edbc8-850f-4035-85a8-2623ec2b8040
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: passthrough  (обёртка вокруг postgresqldim9000.vw_dm_operations_monthly)
-- runs(90d): 383   first_seen: 2026-06-11   last_seen: 2026-07-03
-- referenced_tables: postgresqldim9000.space_apartments, postgresqldim9000.houses, postgresqldim9000.users, postgresqldim9000.spaces, postgresqldim9000.sections, postgresqldim9000.space_commercials, postgresqldim9000.complexes, postgresqldim9000.EVENTS_407641, postgresqldim9000.space_user
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`active_users` AS clmn0_, t0.`complex_name` AS clmn1_, t0.`confirmed_users` AS clmn2_, t0.`count_apartments` AS clmn3_, t0.`count_commercials` AS clmn4_, t0.`count_houses` AS clmn5_, t0.`count_parkings` AS clmn6_, t0.`deactivated_users` AS clmn7_, t0.`non_owners` AS clmn8_, t0.`report_month` AS clmn9_, t0.`total_users` AS clmn10_ FROM `analytics-454817.postgresqldim9000.vw_dm_operations_monthly` AS t0
