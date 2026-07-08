-- Looker Studio custom SQL — financial
-- datasource_id: 2a6589b5-7b34-4391-b067-00b511eee9e8
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.mart_payments_flat)
-- runs(90d): 22   first_seen: 2026-04-09   last_seen: 2026-04-14
-- referenced_tables: -
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`amount_of_charges` AS clmn0_, t0.`complex_name` AS clmn1_, t0.`payment_amount` AS clmn2_, t0.`payment_month` AS clmn3_ FROM `analytics-454817.finance_dash.mart_payments_flat` AS t0
