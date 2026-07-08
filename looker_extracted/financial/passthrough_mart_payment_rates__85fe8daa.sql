-- Looker Studio custom SQL — financial
-- datasource_id: 85fe8daa-1e9d-4e16-8d9f-9cd1ddaef21e
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.mart_payment_rates)
-- runs(90d): 2318   first_seen: 2026-05-02   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.master_buh_service, postgresqldim9000.complexes, postgresqldim9000.tascombank_merchants, postgresqldim9000.spaces, postgresqldim9000.houses, postgresqldim9000.space_commercials, postgresqldim9000.master_buh_service_payment, postgresqldim9000.sections, postgresqldim9000.space_apartments, postgresqldim9000.master_buh_information
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`billing_month` AS clmn0_, t0.`charges` AS clmn1_, t0.`complex_name` AS clmn2_, t0.`is_natural` AS clmn3_, t0.`payment_if_natural` AS clmn4_, t0.`payments` AS clmn5_, t0.`property_kind_ua` AS clmn6_, t0.`space_id` AS clmn7_ FROM `analytics-454817.finance_dash.mart_payment_rates` AS t0
