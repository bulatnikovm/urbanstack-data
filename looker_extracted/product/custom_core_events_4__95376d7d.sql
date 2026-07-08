-- Looker Studio custom SQL — product
-- datasource_id: 95376d7d-fae4-4b9a-9bb4-57403a9229b9
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 145   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.transactions
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  DATE_TRUNC(DATE(created_at), MONTH) AS payment_month,
  SUM(
    CASE
      WHEN status = 'accepted' THEN amount / 100.0
      ELSE 0.0
    END) AS successful_amount_uah,
  COUNT(
    CASE
      WHEN status = 'accepted' THEN 1
    END) AS successful_count,
  COUNT(
    CASE
      WHEN status = 'rejected' THEN 1
    END) AS rejected_count
FROM
  `analytics-454817.postgresqldim9000.transactions`
WHERE
  DATE(created_at) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE) AND
  type = 'utilities'
GROUP BY 1
ORDER BY 1
