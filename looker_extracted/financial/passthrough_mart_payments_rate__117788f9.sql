-- Looker Studio custom SQL — financial
-- datasource_id: 117788f9-4315-4f00-aab1-3678538caef2
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.mart_payments_rate)
-- runs(90d): 103   first_seen: 2026-04-09   last_seen: 2026-04-14
-- referenced_tables: postgresqldim9000.master_buh_service_payment, postgresqldim9000.operations, postgresqldim9000.space_apartments, postgresqldim9000.sections, postgresqldim9000.houses, postgresqldim9000.space_commercials, postgresqldim9000.master_buh_information, postgresqldim9000.spaces, postgresqldim9000.master_buh_service, postgresqldim9000.tascombank_merchants, postgresqldim9000.complexes, postgresqldim9000.transactions
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`complex_name` AS clmn0_, t0.`report_month` AS clmn1_, t0.`total_billed_previous` AS clmn2_, t0.`total_payments_received` AS clmn3_ FROM `analytics-454817.finance_dash.mart_payments_rate` AS t0
