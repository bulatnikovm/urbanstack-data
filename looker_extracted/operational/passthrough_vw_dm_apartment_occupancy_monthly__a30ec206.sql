-- Looker Studio custom SQL — operational
-- datasource_id: a30ec206-29b1-4373-a6af-24425e9bab2d
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: passthrough  (обёртка вокруг postgresqldim9000.vw_dm_apartment_occupancy_monthly)
-- runs(90d): 24   first_seen: 2026-06-25   last_seen: 2026-07-03
-- referenced_tables: postgresqldim9000.houses, postgresqldim9000.spaces, postgresqldim9000.users, postgresqldim9000.complexes, postgresqldim9000.space_user, postgresqldim9000.space_apartments, postgresqldim9000.sections
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`complex_name` AS clmn0_, t0.`house_address` AS clmn1_, t0.`occupied_apartments` AS clmn2_, t0.`occupied_by_confirmed_apartments` AS clmn3_, t0.`report_month` AS clmn4_, t0.`total_apartments` AS clmn5_ FROM `analytics-454817.postgresqldim9000.vw_dm_apartment_occupancy_monthly` AS t0
