-- Looker Studio custom SQL — report_4a81b2d6_masterbuh
-- datasource_id: 18b977e1-dad1-4ec2-b21a-178b6f490cea
-- report_id: 4a81b2d6-ad30-40c4-be18-5b659d6e9f0c
-- type: custom
-- runs(90d): 31   first_seen: 2026-04-15   last_seen: 2026-04-16
-- referenced_tables: postgresqldim9000.master_buh_service_payment, postgresqldim9000.spaces, postgresqldim9000.master_buh_information, postgresqldim9000.master_buh_service, postgresqldim9000.houses, postgresqldim9000.sections, postgresqldim9000.complexes
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  period_bounds AS (
    SELECT
      MAX(period) AS current_period
    FROM
      `analytics-454817.postgresqldim9000.master_buh_service_payment`
  ),
  total_counts AS (
    SELECT
      c.name AS complex_name,
      h.number AS house_number,
      COUNT(DISTINCT s.id) AS total_spaces
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON h.complex_id = c.id
    GROUP BY 1, 2
  ),
  first_sync AS (
    SELECT
      complexes.name AS complex_name,
      h.number AS house_number,
      info.space_id,
      MIN(DATE(p.synced_at)) AS first_sync_date
    FROM
      `analytics-454817.postgresqldim9000.master_buh_service_payment` AS p
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_service` AS srv
      ON p.service_id = srv.id
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_information` AS info
      ON srv.master_buh_information_id = info.id
      JOIN
      `analytics-454817.postgresqldim9000.spaces` AS s
      ON info.space_id = s.id
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS complexes
      ON h.complex_id = complexes.id
      CROSS JOIN
      period_bounds
    WHERE
      p.period = period_bounds.current_period AND p.synced_at IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  daily_new AS (
    SELECT
      complex_name,
      house_number,
      first_sync_date AS sync_date,
      COUNT(DISTINCT space_id) AS newly_synced_spaces
    FROM
      first_sync
    GROUP BY 1, 2, 3
  ),
  cumulative AS (
    SELECT
      complex_name,
      house_number,
      sync_date,
      newly_synced_spaces,
      SUM(newly_synced_spaces) OVER (PARTITION BY complex_name, house_number
        ORDER BY sync_date) AS cumulative_spaces
    FROM
      daily_new
  )
SELECT
  c.complex_name,
  c.house_number,
  c.sync_date,
  c.newly_synced_spaces,
  c.cumulative_spaces,
  t.total_spaces,
  SAFE_DIVIDE(c.cumulative_spaces, t.total_spaces) AS cumulative_percent
FROM
  cumulative AS c
  JOIN
  total_counts AS t
  ON c.complex_name = t.complex_name AND c.house_number = t.house_number
ORDER BY c.complex_name, c.house_number, c.sync_date
