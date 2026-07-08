-- Looker Studio custom SQL — financial
-- datasource_id: fcb30dc3-22c5-4121-a30a-6867fabef13a
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: custom
-- runs(90d): 2   first_seen: 2026-07-07   last_seen: 2026-07-07
-- referenced_tables: postgresqldim9000.spaces, postgresqldim9000.space_apartments, postgresqldim9000.houses, postgresqldim9000.statistic_citizen, postgresqldim9000.space_commercials, postgresqldim9000.sections, postgresqldim9000.orders, postgresqldim9000.complexes
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  calendar AS (
    SELECT
      report_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE('2024-01-01'), DATE_TRUNC(`CURRENT_DATE`(), MONTH), INTERVAL 1 MONTH)) AS report_month
  ),
  houses_filtered AS (
    SELECT
      h.id AS house_id,
      h.complex_id,
      CAST(h.created_at AS TIMESTAMP) AS house_created_at,
      CAST(h.number AS STRING) AS house_number,
      h.status,
      CAST(h.updated_at AS TIMESTAMP) AS house_updated_at
    FROM
      `analytics-454817.postgresqldim9000.houses` AS h
  ),
  house_timeline AS (
    SELECT
      hf.*,
      c.name AS complex_name,
      CASE
        WHEN c.name LIKE '%Севен%' AND hf.house_number LIKE '%20%' THEN DATE('2025-09-01')
        WHEN c.name LIKE '%Севен%' AND hf.house_number LIKE '%16%' THEN DATE('2025-10-01')
        WHEN hf.status = 'deactivated' THEN DATE_TRUNC(DATE(hf.house_updated_at), MONTH)
        ELSE NULL
      END AS disconnect_date
    FROM
      houses_filtered AS hf
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON hf.complex_id = c.id
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
  space_timeline AS (
    SELECT
      sd.space_id,
      sd.refined_kind,
      CAST(sd.created_at AS TIMESTAMP) AS space_created_at,
      ht.complex_id,
      ht.complex_name,
      ht.house_id,
      CASE
        WHEN ht.complex_name LIKE '%Севен%' AND ht.house_number LIKE '%20%' THEN DATE('2025-09-01')
        WHEN ht.complex_name LIKE '%Севен%' AND ht.house_number LIKE '%18%' AND sd.refined_kind = 'parking' THEN NULL
        WHEN ht.complex_name LIKE '%Севен%' AND (ht.house_number LIKE '%16%' OR ht.house_number LIKE '%18%') THEN DATE('2025-10-01')
        WHEN ht.disconnect_date IS NOT NULL THEN ht.disconnect_date
        ELSE NULL
      END AS disconnect_date
    FROM
      space_definitions AS sd
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON sd.section_id = sec.id
      JOIN
      house_timeline AS ht
      ON sec.house_id = ht.house_id
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
      space_timeline AS sh
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
      space_timeline AS sh
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
      space_timeline AS sh
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
          WHEN DATE_TRUNC(DATE(ht.house_created_at), MONTH) <= cal.report_month AND (ht.disconnect_date IS NULL OR
          cal.report_month < ht.disconnect_date) THEN ht.house_id
        END) AS houses_count,
      COUNT(DISTINCT
        CASE
          WHEN st.refined_kind = 'apartment' AND DATE_TRUNC(DATE(st.space_created_at), MONTH) <= cal.report_month AND
          (st.disconnect_date IS NULL OR cal.report_month < st.disconnect_date) THEN st.space_id
        END) AS apartments_count,
      COUNT(DISTINCT
        CASE
          WHEN st.refined_kind = 'commercial' AND DATE_TRUNC(DATE(st.space_created_at), MONTH) <= cal.report_month AND
          (st.disconnect_date IS NULL OR cal.report_month < st.disconnect_date) THEN st.space_id
        END) AS commercials_count,
      COUNT(DISTINCT
        CASE
          WHEN st.refined_kind = 'parking' AND DATE_TRUNC(DATE(st.space_created_at), MONTH) <= cal.report_month AND
          (st.disconnect_date IS NULL OR cal.report_month < st.disconnect_date) THEN st.space_id
        END) AS parking_count
    FROM
      `analytics-454817.postgresqldim9000.complexes` AS c
      CROSS JOIN
      calendar AS cal
      LEFT JOIN
      house_timeline AS ht
      ON c.id = ht.complex_id
      LEFT JOIN
      space_timeline AS st
      ON c.id = st.complex_id AND ht.house_id = st.house_id
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
      CASE
        WHEN c.name LIKE '%Севен%' AND inf.report_month >= DATE('2025-10-01') THEN 518
        WHEN c.name LIKE '%Севен%' AND inf.report_month = DATE('2025-09-01') THEN 2100
        ELSE COALESCE(st.total_users_count, 0)
      END AS total_users_count,
      CASE
        WHEN c.name LIKE '%Севен%' AND inf.report_month >= DATE('2025-10-01') THEN 0
        WHEN c.name LIKE '%Севен%' AND inf.report_month = DATE('2025-09-01') THEN 0
        ELSE COALESCE(st.residents_non_owners_count, 0)
      END AS residents_non_owners_count,
      CASE
        WHEN c.name LIKE '%Севен%' AND inf.report_month >= DATE('2025-10-01') THEN 0
        WHEN c.name LIKE '%Севен%' AND inf.report_month = DATE('2025-09-01') THEN 0
        ELSE COALESCE(st.active_users_count, 0)
      END AS active_users_count,
      CASE
        WHEN c.name LIKE '%Севен%' AND inf.report_month >= DATE('2025-10-01') THEN 518
        WHEN c.name LIKE '%Севен%' AND inf.report_month = DATE('2025-09-01') THEN 2100
        ELSE COALESCE(st.confirmed_users_count, 0)
      END AS confirmed_users_count,
      COALESCE(st.total_users_count, 0) AS sc_total_users_count,
      COALESCE(st.residents_non_owners_count, 0) AS sc_residents_non_owners_count,
      COALESCE(st.active_users_count, 0) AS sc_active_users_count,
      COALESCE(st.confirmed_users_count, 0) AS sc_confirmed_users_count,
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
  sc_total_users_count,
  sc_residents_non_owners_count,
  sc_active_users_count,
  sc_confirmed_users_count,
  count_opened AS opened_requests,
  count_completed AS completed_requests,
  count_canceled AS canceled_requests,
  SAFE_DIVIDE(count_completed, NULLIF(count_opened, 0)) AS pct_completed_requests,
  SUM(count_opened - count_completed - count_canceled) OVER (PARTITION BY complex_name
    ORDER BY reporting_period) AS backlog_requests
FROM
  final_join
ORDER BY reporting_period DESC, complex_name
