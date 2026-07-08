-- Looker Studio custom SQL — report_39cd1c8c_statistic
-- datasource_id: da1fc67a-c73a-4ad7-affa-6a62850afdd9
-- report_id: 39cd1c8c-3dca-4f2b-9344-1b341e2bcfb6
-- type: passthrough  (обёртка вокруг postgresqldim9000.statistic_order)
-- runs(90d): 16   first_seen: 2026-04-28   last_seen: 2026-05-12
-- referenced_tables: postgresqldim9000.statistic_order
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`client_complaint` AS clmn0_, t0.`client_offer` AS clmn1_, t0.`client_problem` AS clmn2_, t0.`client_question` AS clmn3_, t0.`client_service` AS clmn4_, t0.`mobile_orders` AS clmn5_, t0.`month` AS clmn6_, t0.`order_percent` AS clmn7_, t0.`review_avg` AS clmn8_, t0.`total_orders` AS clmn9_, t0.`year` AS clmn10_ FROM `analytics-454817.postgresqldim9000.statistic_order` AS t0
