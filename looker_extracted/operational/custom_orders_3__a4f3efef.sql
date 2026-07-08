-- Looker Studio custom SQL — operational
-- datasource_id: a4f3efef-8aa7-42fa-bf3d-78cf12156270
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 47   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: postgresqldim9000.orders
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  CASE
    WHEN status IN ('new', 'consideration', 'in_progress') THEN '1. В процесі'
    WHEN status = 'completed' THEN '2. Виконано'
    WHEN status IN ('canceled', 'rejected') THEN '3. Скасовано'
    ELSE status
  END AS status_group,
  COUNT(id) AS requests_count
FROM
  `analytics-454817.postgresqldim9000.orders`
WHERE
  created_at IS NOT NULL
GROUP BY 1
ORDER BY 1
