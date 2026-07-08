-- Looker Studio custom SQL — product
-- datasource_id: 4738bf74-06ed-47ac-9e8f-1a212d6474fe
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 20   first_seen: 2026-05-13   last_seen: 2026-06-01
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  DATE_TRUNC(DATE(event_time), MONTH) AS activity_month,
  COUNT(DISTINCT amplitude_id) AS active_users
FROM
  `analytics-454817.postgresqldim9000.EVENTS_407641`
WHERE
  amplitude_id IS NOT NULL AND DATE(event_time) >= '2023-08-01' AND DATE(event_time) <= `CURRENT_DATE`()
GROUP BY activity_month
ORDER BY activity_month
