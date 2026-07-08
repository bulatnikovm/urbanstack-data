-- Looker Studio custom SQL — financial
-- datasource_id: dbf2dc85-cb90-4379-a58c-1c3ba15ea8cb
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.mart_debt_aging)
-- runs(90d): 353   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.complexes, postgresqldim9000.tascombank_merchants, postgresqldim9000.houses, postgresqldim9000.master_buh_service, postgresqldim9000.space_apartments, postgresqldim9000.master_buh_service_payment, postgresqldim9000.master_buh_information, postgresqldim9000.sections, postgresqldim9000.spaces, postgresqldim9000.space_commercials
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`aging_bucket` AS clmn0_, t0.`aging_sort_order` AS clmn1_, t0.`complex_name` AS clmn2_, t0.`debt_in_bucket` AS clmn3_, t0.`llc_name` AS clmn4_, t0.`snapshot_month` AS clmn5_ FROM `analytics-454817.finance_dash.mart_debt_aging` AS t0
