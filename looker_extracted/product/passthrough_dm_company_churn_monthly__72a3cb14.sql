-- Looker Studio custom SQL — product
-- datasource_id: 72a3cb14-d23b-4643-9230-b84885a335bd
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: passthrough  (обёртка вокруг postgresqldim9000.dm_company_churn_monthly)
-- runs(90d): 41   first_seen: 2026-06-01   last_seen: 2026-06-11
-- referenced_tables: postgresqldim9000.dm_company_churn_monthly
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`new_or_resurrected_users` AS clmn0_, t0.`report_month` AS clmn1_, t0.`retained_users` AS clmn2_ FROM `analytics-454817.postgresqldim9000.dm_company_churn_monthly` AS t0
