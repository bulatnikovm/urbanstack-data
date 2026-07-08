-- Looker Studio custom SQL — product
-- datasource_id: 8835a9b6-093c-4e98-8f97-b77b2dcc37dc
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 147   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.transactions
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  DATE_TRUNC(DATE(created_at), MONTH) AS payment_month,
  CASE
    WHEN status = 'accepted' THEN 'Успішні'
    WHEN status = 'rejected' THEN 'Відхилені'
  END AS payment_status,
  COUNT(*) AS payment_count
FROM
  `analytics-454817.postgresqldim9000.transactions`
WHERE
  DATE(created_at) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE) AND
  type = 'utilities' AND status IN ('accepted', 'rejected')
GROUP BY 1, 2
ORDER BY 1, 3 DESC
