-- Looker Studio custom SQL — report_39cd1c8c_statistic
-- datasource_id: aac8574e-764c-45c6-b5c8-0488288ef005t0
-- report_id: 39cd1c8c-3dca-4f2b-9344-1b341e2bcfb6
-- type: passthrough  (обёртка вокруг postgresqldim9000.statistic_house)
-- runs(90d): 78   first_seen: 2026-04-28   last_seen: 2026-05-12
-- referenced_tables: postgresqldim9000.statistic_house
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT DATE(TIMESTAMP '2026-05-12 09:22:40.218094+00', 'UTC') AS clmn0_, t0.`adjacent_territory` AS clmn1_, t0.`cleaning` AS clmn2_, t0.`client_service` AS clmn3_, t0.`electricity` AS clmn4_, t0.`elevator` AS clmn5_, t0.`financial_issues` AS clmn6_, t0.`fire_protection_system` AS clmn7_, t0.`heating` AS clmn8_, t0.`house_id` AS clmn9_, t0.`intercom_and_video` AS clmn10_, t0.`month` AS clmn11_, t0.`other` AS clmn12_, t0.`protection` AS clmn13_, t0.`repairs` AS clmn14_, t0.`sewerage` AS clmn15_, t0.`total` AS clmn16_, t0.`ventilation` AS clmn17_, t0.`water_supply` AS clmn18_, t0.`year` AS clmn19_ FROM `analytics-454817.postgresqldim9000.statistic_house` AS t0
