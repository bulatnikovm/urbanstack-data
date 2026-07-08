-- Looker Studio custom SQL — operational
-- datasource_id: 712d860f-4c10-4e25-9178-b579131c8ca7
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 32   first_seen: 2026-06-12   last_seen: 2026-07-01
-- referenced_tables: -
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  space_hierarchy AS (
    SELECT
      s.id AS space_id,
      comp.name AS complex_name
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS comp
      ON h.complex_id = comp.id
    WHERE
      h.id NOT IN ('e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649', '6017b015-6916-41db-9404-dd5b0885434b',
        'ef446c3b-c38f-4fa2-a887-9633fbba4071', '91aa654b-f87c-48fe-b144-2fa8fd9932df', '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2',
        'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f', '18c381e0-afa9-4b7f-82cd-9d005dca90e1',
        '0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21') AND comp.id NOT IN ('09c50e9a-7685-435d-ac36-4934aa7fd39c', '585e7b5b-737d-4ad9-bf25-76fdb0af015a',
        'b59820ce-0548-4ade-994d-f617202ad2c5')
  )
SELECT
  sh.complex_name,
  CAST(EXTRACT(YEAR FROM DATE(SAFE_CAST(o.created_at AS TIMESTAMP))) AS STRING) AS creation_year,
  COUNT(o.id) AS total_created,
  COUNT(
    CASE
      WHEN o.status = 'completed' THEN o.id
    END) AS total_completed,
  COUNT(
    CASE
      WHEN o.status IN ('new', 'consideration', 'in_progress') THEN o.id
    END) AS total_in_progress,
  COUNT(
    CASE
      WHEN o.status IN ('canceled', 'rejected') THEN o.id
    END) AS total_canceled,
  SAFE_DIVIDE(COUNT(
      CASE
        WHEN o.status = 'completed' THEN o.id
      END), COUNT(o.id)) AS completion_rate
FROM
  `analytics-454817.postgresqldim9000.orders` AS o
  JOIN
  space_hierarchy AS sh
  ON o.space_id = sh.space_id
WHERE
  o.created_at IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2 DESC
