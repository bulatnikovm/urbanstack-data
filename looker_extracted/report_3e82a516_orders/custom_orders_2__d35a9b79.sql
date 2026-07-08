-- Looker Studio custom SQL — report_3e82a516_orders
-- datasource_id: d35a9b79-8cbf-43c0-92d0-284b38510394
-- report_id: 3e82a516-32b2-4534-80ff-b8db6b584a94
-- type: custom
-- runs(90d): 14   first_seen: 2026-05-21   last_seen: 2026-06-02
-- referenced_tables: -
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  excluded_houses AS (
    SELECT
      house_id
    FROM
      UNNEST(ARRAY['0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21', 'e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649',
      '6017b015-6916-41db-9404-dd5b0885434b', 'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '91aa654b-f87c-48fe-b144-2fa8fd9932df',
      '18c381e0-afa9-4b7f-82cd-9d005dca90e1', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f', 'ef446c3b-c38f-4fa2-a887-9633fbba4071',
      '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2']) AS house_id
  ),
  excluded_complexes AS (
    SELECT
      id
    FROM
      UNNEST(ARRAY['09c50e9a-7685-435d-ac36-4934aa7fd39c', '585e7b5b-737d-4ad9-bf25-76fdb0af015a', 'b59820ce-0548-4ade-994d-f617202ad2c5']) AS id
  ),
  complex_units AS (
    SELECT
      c.id AS complex_id,
      c.name AS complex_name
    FROM
      `analytics-454817.postgresqldim9000.complexes` AS c
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON c.id = h.complex_id
    WHERE
      c.id NOT IN (
        SELECT
          id
        FROM
          excluded_complexes
      )
    GROUP BY 1, 2
  ),
  monthly_problems AS (
    SELECT
      h.complex_id,
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) IN ('client_problem', 'client_complaint') THEN o.id
        END) AS count_ps,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) = 'client_complaint' THEN o.id
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
      LOWER(o.status) NOT IN ('canceled', 'cancelled') AND h.id NOT IN (
        SELECT
          house_id
        FROM
          excluded_houses
      ) AND h.complex_id NOT IN (
        SELECT
          id
        FROM
          excluded_complexes
      )
    GROUP BY 1, 2
  ),
  final_stats AS (
    SELECT
      cu.complex_name,
      mp.report_month,
      mp.count_ps,
      mp.count_s
    FROM
      monthly_problems AS mp
      JOIN
      complex_units AS cu
      ON mp.complex_id = cu.complex_id
  )
SELECT
  complex_name,
  report_month,
  count_ps,
  count_s
FROM
  final_stats
ORDER BY report_month DESC, complex_name
