-- Looker Studio custom SQL — financial
-- datasource_id: c1a8200b-1e12-4600-a45f-0da5ea46f540
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.mart_payment_rates_cohort)
-- runs(90d): 118   first_seen: 2026-07-07   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.master_buh_service_payment, postgresqldim9000.master_buh_service, postgresqldim9000.space_apartments, postgresqldim9000.space_commercials, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.master_buh_information, postgresqldim9000.spaces, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`billing_month` AS clmn0_, t0.`charges` AS clmn1_, t0.`complex_name` AS clmn2_, t0.`is_natural` AS clmn3_, t0.`payment_if_natural` AS clmn4_, t0.`payments` AS clmn5_, t0.`space_id` AS clmn6_ FROM `analytics-454817.finance_dash.mart_payment_rates_cohort` AS t0
