-- Looker Studio custom SQL — financial
-- datasource_id: 057db953-16df-485b-a3ee-f4cbd7e8fc30
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.mart_debt_years)
-- runs(90d): 430   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.houses, postgresqldim9000.master_buh_service_payment, postgresqldim9000.complexes, postgresqldim9000.space_apartments, postgresqldim9000.spaces, postgresqldim9000.space_commercials, postgresqldim9000.master_buh_service, postgresqldim9000.master_buh_information, postgresqldim9000.tascombank_merchants, postgresqldim9000.sections
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`complex_name` AS clmn0_, t0.`debt_amount` AS clmn1_, t0.`debt_year` AS clmn2_ FROM `analytics-454817.finance_dash.mart_debt_years` AS t0
