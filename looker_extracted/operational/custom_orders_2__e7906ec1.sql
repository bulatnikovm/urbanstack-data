-- Looker Studio custom SQL — operational
-- datasource_id: e7906ec1-2ede-48fa-a273-93067a156bff
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 61   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: postgresqldim9000.orders, postgresqldim9000.houses, postgresqldim9000.spaces, postgresqldim9000.sections
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  space_hierarchy AS (
    SELECT
      s.id AS space_id
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
    WHERE
      h.id NOT IN ('e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649', '6017b015-6916-41db-9404-dd5b0885434b',
        'ef446c3b-c38f-4fa2-a887-9633fbba4071', '91aa654b-f87c-48fe-b144-2fa8fd9932df', '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2',
        'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f', '18c381e0-afa9-4b7f-82cd-9d005dca90e1',
        '0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21')
  ),
  Request_Actions AS (
    SELECT
      EXTRACT(YEAR FROM DATE(SAFE_CAST(o.created_at AS TIMESTAMP))) AS action_year,
      '1_Opened' AS action_type
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.created_at IS NOT NULL
    UNION ALL
    SELECT
      EXTRACT(YEAR FROM DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP))) AS action_year,
      '2_Completed' AS action_type
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.status = 'completed'
    UNION ALL
    SELECT
      EXTRACT(YEAR FROM DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP))) AS action_year,
      '3_Canceled' AS action_type
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.status IN ('canceled', 'rejected')
  ),
  Yearly_Agg AS (
    SELECT
      action_year AS creation_year,
      SUM(
        CASE
          WHEN action_type = '1_Opened' THEN 1
          ELSE 0
        END) AS total_created,
      SUM(
        CASE
          WHEN action_type = '2_Completed' THEN 1
          ELSE 0
        END) AS completed,
      SUM(
        CASE
          WHEN action_type = '3_Canceled' THEN 1
          ELSE 0
        END) AS canceled
    FROM
      Request_Actions
    WHERE
      action_year IS NOT NULL
    GROUP BY 1
  )
SELECT
  creation_year,
  CAST(total_created AS INT64) AS total_created,
  CAST(completed AS INT64) AS completed,
  SAFE_DIVIDE(completed, total_created) AS completion_rate,
  CAST(SUM(total_created - completed - canceled) OVER (
    ORDER BY creation_year) AS INT64) AS backlog,
  CAST(canceled AS INT64) AS canceled
FROM
  Yearly_Agg
ORDER BY creation_year DESC
