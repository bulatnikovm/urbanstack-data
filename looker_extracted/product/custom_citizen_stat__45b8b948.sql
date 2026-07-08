-- Looker Studio custom SQL — product
-- datasource_id: 45b8b948-5067-4694-8f89-86c59e6230d6
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 25   first_seen: 2026-04-13   last_seen: 2026-06-01
-- referenced_tables: postgresqldim9000.complexes, postgresqldim9000.statistic_citizen
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  DATE(CAST(sc.year AS INT64), CAST(sc.month AS INT64), 1) AS report_date,
  c.name AS complex_name,
  sc.total AS potential_users,
  sc.confirmed_user AS confirmed_users,
  ROUND(SAFE_DIVIDE(sc.confirmed_user, sc.total) * 100, 2) AS penetration_rate
FROM
  `analytics-454817.postgresqldim9000.statistic_citizen` AS sc
  LEFT JOIN
  `analytics-454817.postgresqldim9000.complexes` AS c
  ON sc.complex_id = c.id
QUALIFY ROW_NUMBER() OVER (PARTITION BY sc.complex_id, sc.year, sc.month
  ORDER BY sc.updated_at DESC) = 1
ORDER BY complex_name, report_date DESC
