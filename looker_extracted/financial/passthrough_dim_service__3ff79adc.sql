-- Looker Studio custom SQL — financial
-- datasource_id: 3ff79adc-7975-4840-b400-4a8239752bc8
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: passthrough  (обёртка вокруг finance_dash.dim_service)
-- runs(90d): 156   first_seen: 2026-04-09   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.master_buh_service
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT t0.`service_name` AS clmn0_, t0.`service_type_code` AS clmn1_ FROM `analytics-454817.finance_dash.dim_service` AS t0
