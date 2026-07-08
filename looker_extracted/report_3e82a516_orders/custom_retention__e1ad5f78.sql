-- Looker Studio custom SQL — report_3e82a516_orders
-- datasource_id: e1ad5f78-cc36-4dc9-a4ee-d796aeaa822d
-- report_id: 3e82a516-32b2-4534-80ff-b8db6b584a94
-- type: custom
-- runs(90d): 135   first_seen: 2026-05-21   last_seen: 2026-06-10
-- referenced_tables: postgresqldim9000.statistic_citizen, postgresqldim9000.orders, postgresqldim9000.complexes, postgresqldim9000.sections, postgresqldim9000.spaces, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  house_deactivation_dates AS (
    SELECT
      house_id,
      DATE(deactivated_date) AS deactivated_date
    FROM
      UNNEST(ARRAY[STRUCT('e898c6d1-227c-462f-aec2-d4f8949f7f6b' AS house_id, '2025-08-01' AS deactivated_date),
      STRUCT('a72558c9-5f78-4633-a425-b42a79ee3649' AS house_id, '2025-08-01' AS deactivated_date), STRUCT('6017b015-6916-41db-9404-dd5b0885434b' AS house_id,
        '2025-08-01' AS deactivated_date), STRUCT('56d86356-cfe1-4382-b3be-d0fe2c0dba3f' AS house_id, '2025-09-01' AS deactivated_date),
      STRUCT('18c381e0-afa9-4b7f-82cd-9d005dca90e1' AS house_id, '2025-09-01' AS deactivated_date), STRUCT('ef446c3b-c38f-4fa2-a887-9633fbba4071' AS house_id,
        '2025-10-01' AS deactivated_date), STRUCT('91aa654b-f87c-48fe-b144-2fa8fd9932df' AS house_id, '2025-10-01' AS deactivated_date),
      STRUCT('60b3c00e-fc59-41d3-b6b2-c8deb8f508d2' AS house_id, '2025-10-01' AS deactivated_date), STRUCT('b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30' AS house_id,
        '2025-10-01' AS deactivated_date), STRUCT('0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21' AS house_id, '2025-12-01' AS deactivated_date)])
  ),
  excluded_complexes AS (
    SELECT
      id
    FROM
      UNNEST(ARRAY['09c50e9a-7685-435d-ac36-4934aa7fd39c', '585e7b5b-737d-4ad9-bf25-76fdb0af015a', 'b59820ce-0548-4ade-994d-f617202ad2c5']) AS id
  ),
  calendar AS (
    SELECT
      report_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE('2021-01-01'), DATE_TRUNC(`CURRENT_DATE`(), MONTH), INTERVAL 1 MONTH)) AS report_month
  ),
  report_backbone AS (
    SELECT
      c.report_month,
      comp.id AS complex_id,
      comp.name AS complex_name
    FROM
      calendar AS c
      CROSS JOIN
      `analytics-454817.postgresqldim9000.complexes` AS comp
    WHERE
      comp.id NOT IN (
        SELECT
          id
        FROM
          excluded_complexes
      )
  ),
  clean_spaces AS (
    SELECT
      s.id AS space_id,
      h.complex_id,
      DATE(s.created_at) AS created_at,
      CASE
        WHEN s.kind = 'parking' THEN NULL
        ELSE hd.deactivated_date
      END AS deactivated_date
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      LEFT JOIN
      house_deactivation_dates AS hd
      ON h.id = hd.house_id
  ),
  clean_account_counts AS (
    SELECT
      rb.report_month,
      rb.complex_id,
      COUNT(cs.space_id) AS total_accounts
    FROM
      report_backbone AS rb
      LEFT JOIN
      clean_spaces AS cs
      ON rb.complex_id = cs.complex_id AND cs.created_at <= rb.report_month AND (cs.deactivated_date IS NULL OR
        rb.report_month < cs.deactivated_date)
    GROUP BY 1, 2
  ),
  created_stats AS (
    SELECT
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      cs.complex_id,
      COUNT(DISTINCT o.id) AS created_total_orders,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.status) IN ('canceled', 'cancelled', 'rejected') THEN o.id
        END) AS cohort_canceled_orders,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.status) NOT IN ('canceled', 'cancelled', 'rejected') THEN o.id
        END) AS valid_orders
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      clean_spaces AS cs
      ON o.space_id = cs.space_id
    WHERE
      (cs.deactivated_date IS NULL OR DATE_TRUNC(DATE(o.created_at), MONTH) < cs.deactivated_date)
    GROUP BY 1, 2
  ),
  completed_stats AS (
    SELECT
      DATE_TRUNC(DATE(COALESCE(o.completed_at, o.updated_at)), MONTH) AS report_month,
      cs.complex_id,
      COUNT(DISTINCT o.id) AS completed_orders
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      clean_spaces AS cs
      ON o.space_id = cs.space_id
    WHERE
      LOWER(o.status) = 'completed' AND (cs.deactivated_date IS NULL OR DATE_TRUNC(DATE(COALESCE(o.completed_at,
            o.updated_at)), MONTH) < cs.deactivated_date)
    GROUP BY 1, 2
  ),
  event_canceled_stats AS (
    SELECT
      DATE_TRUNC(DATE(COALESCE(o.completed_at, o.updated_at, o.created_at)), MONTH) AS report_month,
      cs.complex_id,
      COUNT(DISTINCT o.id) AS event_canceled_orders
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      clean_spaces AS cs
      ON o.space_id = cs.space_id
    WHERE
      LOWER(o.status) IN ('canceled', 'cancelled', 'rejected') AND (cs.deactivated_date IS NULL OR DATE_TRUNC(DATE(COALESCE(o.completed_at,
            o.updated_at, o.created_at)), MONTH) < cs.deactivated_date)
    GROUP BY 1, 2
  ),
  same_month_stats AS (
    SELECT
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      cs.complex_id,
      COUNT(DISTINCT o.id) AS completed_same_month_orders
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      clean_spaces AS cs
      ON o.space_id = cs.space_id
    WHERE
      LOWER(o.status) = 'completed' AND o.completed_at IS NOT NULL AND DATE_TRUNC(DATE(o.completed_at), MONTH) =
      DATE_TRUNC(DATE(o.created_at), MONTH) AND (cs.deactivated_date IS NULL OR DATE_TRUNC(DATE(o.created_at),
        MONTH) < cs.deactivated_date)
    GROUP BY 1, 2
  ),
  citizen_stats_raw AS (
    SELECT
      report_month,
      complex_id,
      SUM(total) AS raw_total_accounts,
      SUM(confirmed_user) AS raw_confirmed_users,
      SUM(active_user) AS raw_active_users
    FROM
      (
        SELECT
          *,
          DATE_TRUNC(DATE(updated_at), MONTH) AS report_month,
          ROW_NUMBER() OVER (PARTITION BY complex_id, DATE_TRUNC(DATE(updated_at), MONTH)
            ORDER BY updated_at DESC) AS rn
        FROM
          `analytics-454817.postgresqldim9000.statistic_citizen`
      )
    WHERE
      rn = 1
    GROUP BY 1, 2
  ),
  pre_final AS (
    SELECT
      rb.report_month,
      rb.complex_name,
      rb.complex_id,
      IFNULL(cr.created_total_orders, 0) AS created_total_orders,
      IFNULL(cr.valid_orders, 0) AS valid_orders,
      IFNULL(cr.cohort_canceled_orders, 0) AS cohort_canceled_orders,
      IFNULL(co.completed_orders, 0) AS completed_orders,
      IFNULL(sm.completed_same_month_orders, 0) AS completed_same_month_orders,
      SUM(IFNULL(cr.created_total_orders, 0) - IFNULL(co.completed_orders, 0) - IFNULL(ca.event_canceled_orders,
          0)) OVER (PARTITION BY rb.complex_id
        ORDER BY rb.report_month) AS tickets_in_progress,
      cs.raw_confirmed_users,
      cs.raw_active_users,
      cs.raw_total_accounts,
      IFNULL(ac.total_accounts, 0) AS final_total_accounts
    FROM
      report_backbone AS rb
      LEFT JOIN
      clean_account_counts AS ac
      ON rb.report_month = ac.report_month AND rb.complex_id = ac.complex_id
      LEFT JOIN
      created_stats AS cr
      ON rb.report_month = cr.report_month AND rb.complex_id = cr.complex_id
      LEFT JOIN
      completed_stats AS co
      ON rb.report_month = co.report_month AND rb.complex_id = co.complex_id
      LEFT JOIN
      same_month_stats AS sm
      ON rb.report_month = sm.report_month AND rb.complex_id = sm.complex_id
      LEFT JOIN
      event_canceled_stats AS ca
      ON rb.report_month = ca.report_month AND rb.complex_id = ca.complex_id
      LEFT JOIN
      citizen_stats_raw AS cs
      ON rb.report_month = cs.report_month AND rb.complex_id = cs.complex_id
  )
SELECT
  report_month AS date,
  complex_name,
  created_total_orders AS tickets_created_all,
  completed_orders AS tickets_completed,
  completed_same_month_orders AS tickets_completed_same_month,
  cohort_canceled_orders AS tickets_canceled,
  tickets_in_progress,
  final_total_accounts AS total_accounts,
  CAST(ROUND(IFNULL(raw_confirmed_users, 0) * SAFE_DIVIDE(final_total_accounts, NULLIF(raw_total_accounts,
        1))) AS INT64) AS app_users,
  CAST(ROUND(IFNULL(raw_active_users, 0) * SAFE_DIVIDE(final_total_accounts, NULLIF(raw_total_accounts,
        1))) AS INT64) AS active_users,
  SAFE_DIVIDE(IFNULL(raw_confirmed_users, 0) * SAFE_DIVIDE(final_total_accounts, NULLIF(raw_total_accounts,
        1)), NULLIF(final_total_accounts, 0)) AS app_adoption_rate
FROM
  pre_final
WHERE
  report_month <= `CURRENT_DATE`() AND report_month >= '2025-01-01'
ORDER BY date DESC, complex_name
