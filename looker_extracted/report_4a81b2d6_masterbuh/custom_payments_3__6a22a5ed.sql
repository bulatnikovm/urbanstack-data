-- Looker Studio custom SQL — report_4a81b2d6_masterbuh
-- datasource_id: 6a22a5ed-6dc8-4536-ae7e-af258e064a8c
-- report_id: 4a81b2d6-ad30-40c4-be18-5b659d6e9f0c
-- type: custom
-- runs(90d): 47   first_seen: 2026-04-13   last_seen: 2026-06-17
-- referenced_tables: postgresqldim9000.master_buh_service, postgresqldim9000.master_buh_information, postgresqldim9000.master_buh_service_payment, postgresqldim9000.houses, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.spaces
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  period_bounds AS (
    SELECT
      MAX(period) AS current_period,
      (
        SELECT
          MAX(period)
        FROM
          `analytics-454817.postgresqldim9000.master_buh_service_payment`
        WHERE
          period < (
            SELECT
              MAX(period)
            FROM
              `analytics-454817.postgresqldim9000.master_buh_service_payment`
          )
      ) AS prev_period
    FROM
      `analytics-454817.postgresqldim9000.master_buh_service_payment`
  ),
  previous_month_data AS (
    SELECT DISTINCT
      info.space_id
    FROM
      `analytics-454817.postgresqldim9000.master_buh_service_payment` AS p
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_service` AS srv
      ON p.service_id = srv.id
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_information` AS info
      ON srv.master_buh_information_id = info.id
      CROSS JOIN
      period_bounds
    WHERE
      p.period = period_bounds.prev_period
  ),
  current_month_data AS (
    SELECT DISTINCT
      info.space_id
    FROM
      `analytics-454817.postgresqldim9000.master_buh_service_payment` AS p
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_service` AS srv
      ON p.service_id = srv.id
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_information` AS info
      ON srv.master_buh_information_id = info.id
      CROSS JOIN
      period_bounds
    WHERE
      p.period = period_bounds.current_period
  )
SELECT
  complexes.name AS complex_name,
  pm.space_id,
  CASE
    WHEN s.kind = 'commercial' AND sc.type = 'parking' THEN CONCAT(l.street, ', буд. ', h.number, ', паркінг ',
      s.number)
    WHEN s.kind = 'commercial' AND sc.type = 'storeroom' THEN CONCAT(l.street, ', буд. ', h.number, ', комора ',
      s.number)
    WHEN s.kind = 'commercial' THEN CONCAT(l.street, ', буд. ', h.number, ', комерція ', s.number)
    ELSE CONCAT(l.street, ', буд. ', h.number, ', кв. ', s.number)
  END AS address,
  (
    SELECT
      current_period
    FROM
      period_bounds
  ) AS lost_in_period
FROM
  previous_month_data AS pm
  LEFT JOIN
  current_month_data AS cm
  ON pm.space_id = cm.space_id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.spaces` AS s
  ON pm.space_id = s.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.space_commercials` AS sc
  ON s.id = sc.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.sections` AS sec
  ON s.section_id = sec.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.houses` AS h
  ON sec.house_id = h.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.locations` AS l
  ON h.location_id = l.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.complexes` AS complexes
  ON h.complex_id = complexes.id
WHERE
  cm.space_id IS NULL
ORDER BY complex_name, address
