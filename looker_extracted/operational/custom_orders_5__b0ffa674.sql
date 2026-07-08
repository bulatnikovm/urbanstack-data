-- Looker Studio custom SQL — operational
-- datasource_id: b0ffa674-5106-4f80-9142-3109ad0d9c22
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 29   first_seen: 2026-04-09   last_seen: 2026-06-30
-- referenced_tables: -
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  complex_units AS (
    SELECT
      c.id AS complex_id,
      c.name AS complex_name,
      COUNT(DISTINCT s.id) AS total_units_op
    FROM
      `analytics-454817.postgresqldim9000.complexes` AS c
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON c.id = h.complex_id
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON h.id = sec.house_id
      JOIN
      `analytics-454817.postgresqldim9000.spaces` AS s
      ON sec.id = s.section_id
    GROUP BY 1, 2
  ),
  monthly_problems AS (
    SELECT
      h.complex_id,
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      COUNT(DISTINCT
        CASE
          WHEN o.type IN ('client_problem', 'client_complaint') THEN o.id
        END) AS count_ps,
      COUNT(DISTINCT
        CASE
          WHEN o.type = 'client_complaint' THEN o.id
        END) AS count_s
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      `analytics-454817.postgresqldim9000.spaces` AS s
      ON o.space_id = s.id
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
    WHERE
      o.status != 'canceled'
    GROUP BY 1, 2
  ),
  final_stats AS (
    SELECT
      cu.complex_name,
      mp.report_month,
      mp.count_ps,
      mp.count_s,
      cu.total_units_op,
      0 AS sort_priority
    FROM
      monthly_problems AS mp
      JOIN
      complex_units AS cu
      ON mp.complex_id = cu.complex_id
  ),
  average_row AS (
    SELECT
      'Середній показник' AS complex_name,
      report_month,
      SUM(count_ps) AS count_ps,
      SUM(count_s) AS count_s,
      SUM(total_units_op) AS total_units_op,
      1 AS sort_priority
    FROM
      final_stats
    GROUP BY report_month
  )
SELECT
  complex_name,
  report_month,
  SAFE_DIVIDE(count_ps, total_units_op) AS load_ps_pct,
  SAFE_DIVIDE(count_s, total_units_op) AS load_s_only_pct
FROM
  (
    SELECT
      *
    FROM
      final_stats
    UNION ALL
    SELECT
      *
    FROM
      average_row
  )
ORDER BY report_month, sort_priority, complex_name
