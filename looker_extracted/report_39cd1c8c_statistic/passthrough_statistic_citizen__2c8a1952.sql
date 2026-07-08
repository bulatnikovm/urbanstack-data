-- Looker Studio custom SQL — report_39cd1c8c_statistic
-- datasource_id: 2c8a1952-344e-4070-9745-2a9d74812462
-- report_id: 39cd1c8c-3dca-4f2b-9344-1b341e2bcfb6
-- type: passthrough  (обёртка вокруг postgresqldim9000.statistic_citizen)
-- runs(90d): 12   first_seen: 2026-04-28   last_seen: 2026-05-12
-- referenced_tables: postgresqldim9000.statistic_citizen
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT DATE(TIMESTAMP '2026-05-12 09:22:19.864989+00', 'UTC') AS clmn0_, t0.`month` AS clmn1_, t0.`unconfirmed_user` AS clmn2_, t0.`year` AS clmn3_ FROM `analytics-454817.postgresqldim9000.statistic_citizen` AS t0
