-- Looker Studio custom SQL — operational
-- datasource_id: 7de8e343-97d3-4d5d-991c-1d6e37a24472
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 9   first_seen: 2026-06-12   last_seen: 2026-06-12
-- referenced_tables: postgresqldim9000.sections, postgresqldim9000.space_commercials, postgresqldim9000.statistic_citizen, postgresqldim9000.spaces, postgresqldim9000.space_apartments, postgresqldim9000.complexes, postgresqldim9000.houses, postgresqldim9000.orders
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  calendar AS (
    SELECT
      report_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE('2024-01-01'), DATE_TRUNC(`CURRENT_DATE`(), MONTH), INTERVAL 1 MONTH)) AS report_month
  ),
  space_definitions AS (
    SELECT
      s.id AS space_id,
      s.section_id,
      s.created_at,
      CASE
        WHEN sc.type IS NOT NULL THEN sc.type
        WHEN sa.id IS NOT NULL THEN 'apartment'
        ELSE s.kind
      END AS refined_kind
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_apartments` AS sa
      ON s.id = sa.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_commercials` AS sc
      ON s.id = sc.id
  ),
  space_hierarchy AS (
    SELECT
      sd.space_id,
      sd.refined_kind,
      CAST(sd.created_at AS TIMESTAMP) AS space_created_at,
      h.complex_id,
      h.id AS house_id,
      CAST(h.created_at AS TIMESTAMP) AS house_created_at
    FROM
      space_definitions AS sd
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON sd.section_id = sec.id
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
      sh.complex_id,
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) AS action_month,
      1 AS is_opened,
      0 AS is_completed,
      0 AS is_canceled
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.created_at IS NOT NULL
    UNION ALL
    SELECT
      sh.complex_id,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH) AS action_month,
      0,
      1,
      0
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.status = 'completed'
    UNION ALL
    SELECT
      sh.complex_id,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH) AS action_month,
      0,
      0,
      1
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.status IN ('canceled', 'rejected')
  ),
  monthly_orders_raw AS (
    SELECT
      complex_id,
      action_month AS report_month,
      SUM(is_opened) AS count_opened,
      SUM(is_completed) AS count_completed,
      SUM(is_canceled) AS count_canceled
    FROM
      Request_Actions
    WHERE
      action_month IS NOT NULL
    GROUP BY 1, 2
  ),
  monthly_stats AS (
    SELECT
      complex_id,
      event_month AS report_month,
      SUM(total) AS total_users_count,
      SUM(citizen) AS residents_non_owners_count,
      SUM(active_user) AS active_users_count,
      SUM(confirmed_user) AS confirmed_users_count
    FROM
      (
        SELECT
          DATE(CAST(year AS INT64), CAST(month AS INT64), 1) AS event_month,
          complex_id,
          total,
          citizen,
          active_user,
          confirmed_user
        FROM
          `analytics-454817.postgresqldim9000.statistic_citizen`
        WHERE
          DATE(CAST(year AS INT64), CAST(month AS INT64), 1) < DATE_TRUNC(`CURRENT_DATE`(), MONTH)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY complex_id, year, month
          ORDER BY updated_at DESC) = 1
        UNION ALL
        SELECT
          DATE_TRUNC(`CURRENT_DATE`(), MONTH) AS event_month,
          complex_id,
          total,
          citizen,
          active_user,
          confirmed_user
        FROM
          `analytics-454817.postgresqldim9000.statistic_citizen`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY complex_id
          ORDER BY updated_at DESC) = 1
      )
    GROUP BY 1, 2
  ),
  monthly_infra AS (
    SELECT
      c.id AS complex_id,
      cal.report_month,
      COUNT(DISTINCT
        CASE
          WHEN DATE_TRUNC(DATE(h.created_at), MONTH) <= cal.report_month THEN h.id
        END) AS houses_count,
      COUNT(DISTINCT
        CASE
          WHEN sh.refined_kind = 'apartment' AND DATE_TRUNC(DATE(sh.space_created_at), MONTH) <= cal.report_month THEN sh.space_id
        END) AS apartments_count,
      COUNT(DISTINCT
        CASE
          WHEN sh.refined_kind = 'commercial' AND DATE_TRUNC(DATE(sh.space_created_at), MONTH) <= cal.report_month THEN sh.space_id
        END) AS commercials_count,
      COUNT(DISTINCT
        CASE
          WHEN sh.refined_kind = 'parking' AND DATE_TRUNC(DATE(sh.space_created_at), MONTH) <= cal.report_month THEN sh.space_id
        END) AS parking_count
    FROM
      `analytics-454817.postgresqldim9000.complexes` AS c
      CROSS JOIN
      calendar AS cal
      LEFT JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON c.id = h.complex_id AND h.id NOT IN ('e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649',
          '6017b015-6916-41db-9404-dd5b0885434b', 'ef446c3b-c38f-4fa2-a887-9633fbba4071', '91aa654b-f87c-48fe-b144-2fa8fd9932df',
          '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2', 'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f',
          '18c381e0-afa9-4b7f-82cd-9d005dca90e1', '0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21')
      LEFT JOIN
      space_hierarchy AS sh
      ON c.id = sh.complex_id AND sh.house_id = h.id
    GROUP BY 1, 2
  ),
  final_join AS (
    SELECT
      inf.complex_id,
      c.name AS complex_name,
      inf.report_month AS reporting_period,
      inf.houses_count,
      inf.apartments_count,
      inf.commercials_count,
      inf.parking_count,
      COALESCE(st.total_users_count, 0) AS total_users_count,
      COALESCE(st.residents_non_owners_count, 0) AS residents_non_owners_count,
      COALESCE(st.active_users_count, 0) AS active_users_count,
      COALESCE(st.confirmed_users_count, 0) AS confirmed_users_count,
      COALESCE(ord.count_opened, 0) AS count_opened,
      COALESCE(ord.count_completed, 0) AS count_completed,
      COALESCE(ord.count_canceled, 0) AS count_canceled
    FROM
      monthly_infra AS inf
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON inf.complex_id = c.id
      LEFT JOIN
      monthly_stats AS st
      ON inf.complex_id = st.complex_id AND inf.report_month = st.report_month
      LEFT JOIN
      monthly_orders_raw AS ord
      ON inf.complex_id = ord.complex_id AND inf.report_month = ord.report_month
    WHERE
      inf.report_month <= `CURRENT_DATE`()
  )
SELECT
  complex_name,
  reporting_period,
  houses_count,
  apartments_count,
  commercials_count,
  parking_count,
  total_users_count,
  residents_non_owners_count,
  active_users_count,
  confirmed_users_count,
  SAFE_DIVIDE(confirmed_users_count, NULLIF(total_users_count, 0)) AS pct_confirmed_users,
  SAFE_DIVIDE(active_users_count, NULLIF(total_users_count, 0)) AS pct_active_users,
  count_opened AS opened_requests,
  count_completed AS completed_requests,
  count_canceled AS canceled_requests,
  SAFE_DIVIDE(count_completed, NULLIF(count_opened, 0)) AS pct_completed_requests,
  SUM(count_opened - count_completed - count_canceled) OVER (PARTITION BY complex_name
    ORDER BY reporting_period) AS backlog_requests
FROM
  final_join
ORDER BY reporting_period DESC, complex_name
