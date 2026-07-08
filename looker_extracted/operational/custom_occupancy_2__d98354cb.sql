-- Looker Studio custom SQL — operational
-- datasource_id: d98354cb-58ec-4129-973d-3202d9f6bcb3
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 36   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: postgresqldim9000.spaces, postgresqldim9000.houses, postgresqldim9000.sections, postgresqldim9000.orders, postgresqldim9000.complexes
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  excluded_houses AS (
    SELECT
      id
    FROM
      UNNEST(ARRAY['e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649', '6017b015-6916-41db-9404-dd5b0885434b',
      'ef446c3b-c38f-4fa2-a887-9633fbba4071', '91aa654b-f87c-48fe-b144-2fa8fd9932df', '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2',
      'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f', '18c381e0-afa9-4b7f-82cd-9d005dca90e1',
      '0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21']) AS id
  ),
  geo_mapping AS (
    SELECT
      s.id AS space_id,
      c.name AS complex_name,
      h.number AS house_number,
      h.id AS house_id,
      CASE
        WHEN LOWER(s.kind) = 'apartment' THEN 'Квартира'
        WHEN LOWER(s.kind) = 'commercial' THEN 'Комерція'
        WHEN LOWER(s.kind) = 'parking' THEN 'Паркінг'
        ELSE 'Інше'
      END AS object_type
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
  )
SELECT
  DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
  COALESCE(g.complex_name, 'Без ЖК') AS complex_name,
  COALESCE(g.house_number, 'Немає номеру') AS house_number,
  COALESCE(g.object_type, 'Інше') AS object_type,
  COUNT(o.id) AS canceled_tickets_count
FROM
  `analytics-454817.postgresqldim9000.orders` AS o
  LEFT JOIN
  geo_mapping AS g
  ON o.space_id = g.space_id
WHERE
  LOWER(COALESCE(o.status, '')) IN ('canceled', 'cancelled', 'rejected') AND (g.house_id IS NULL OR g.house_id NOT IN
  (
    SELECT
      id
    FROM
      excluded_houses
  ))
GROUP BY 1, 2, 3, 4
ORDER BY canceled_tickets_count DESC
