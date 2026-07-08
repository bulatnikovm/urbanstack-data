-- Looker Studio custom SQL — operational
-- datasource_id: 0e4066b4-7202-4379-b5e7-0e30cc4424ba
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 98   first_seen: 2026-04-26   last_seen: 2026-06-11
-- referenced_tables: postgresqldim9000.houses, postgresqldim9000.spaces, postgresqldim9000.users, postgresqldim9000.complexes, postgresqldim9000.space_user, postgresqldim9000.sections
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
      CAST(id AS STRING) AS house_id,
      CAST(complex_id AS STRING) AS complex_id,
      SAFE_CAST(created_at AS TIMESTAMP) AS house_created_at,
      CAST(number AS STRING) AS house_number,
      CAST(status AS STRING) AS status,
      SAFE_CAST(updated_at AS TIMESTAMP) AS house_updated_at
    FROM
      `analytics-454817.postgresqldim9000.houses`
    WHERE
      id IS NOT NULL AND complex_id IS NOT NULL
  ),
  house_timeline AS (
    SELECT
      hf.*,
      CAST(c.name AS STRING) AS complex_name,
      CASE
        WHEN CAST(c.name AS STRING) LIKE '%Севен%' AND hf.house_number LIKE '%20%' THEN DATE('2025-09-01')
        WHEN CAST(c.name AS STRING) LIKE '%Севен%' AND hf.house_number LIKE '%16%' THEN DATE('2025-10-01')
        WHEN hf.status = 'deactivated' AND hf.house_updated_at IS NOT NULL THEN DATE_TRUNC(DATE(hf.house_updated_at),
          MONTH)
        ELSE NULL
      END AS disconnect_date
    FROM
      houses_filtered AS hf
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON hf.complex_id = CAST(c.id AS STRING)
  ),
  space_definitions AS (
    SELECT
      CAST(s.id AS STRING) AS space_id,
      CAST(s.section_id AS STRING) AS section_id,
      CAST(s.owner_id AS STRING) AS owner_id,
      SAFE_CAST(s.created_at AS TIMESTAMP) AS created_at,
      CASE
        WHEN sc.id IS NOT NULL THEN COALESCE(CAST(sc.type AS STRING), 'commercial')
        WHEN sa.id IS NOT NULL THEN 'apartment'
        ELSE CAST(s.kind AS STRING)
      END AS refined_kind
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_apartments` AS sa
      ON CAST(s.id AS STRING) = CAST(sa.id AS STRING)
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_commercials` AS sc
      ON CAST(s.id AS STRING) = CAST(sc.id AS STRING)
    WHERE
      s.id IS NOT NULL
  ),
  space_timeline AS (
    SELECT
      sd.space_id,
      sd.refined_kind,
      sd.owner_id,
      sd.created_at AS space_created_at,
      ht.complex_id,
      ht.complex_name,
      ht.house_id,
      CASE
        WHEN ht.complex_name LIKE '%Севен%' AND ht.house_number LIKE '%20%' THEN DATE('2025-09-01')
        WHEN ht.complex_name LIKE '%Севен%' AND ht.house_number LIKE '%18%' AND sd.refined_kind LIKE '%parking%' THEN NULL
        WHEN ht.complex_name LIKE '%Севен%' AND (ht.house_number LIKE '%16%' OR ht.house_number LIKE '%18%') THEN DATE('2025-10-01')
        WHEN ht.disconnect_date IS NOT NULL THEN ht.disconnect_date
        ELSE NULL
      END AS disconnect_date
    FROM
      space_definitions AS sd
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON sd.section_id = CAST(sec.id AS STRING)
      JOIN
      house_timeline AS ht
      ON CAST(sec.house_id AS STRING) = ht.house_id
  ),
  Request_Actions AS (
    SELECT
      CAST(o.space_id AS STRING) AS space_id,
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) AS action_month,
      1 AS is_opened,
      0 AS is_completed,
      0 AS is_canceled
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
    WHERE
      o.created_at IS NOT NULL AND o.space_id IS NOT NULL
    UNION ALL
    SELECT
      CAST(o.space_id AS STRING) AS space_id,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH) AS action_month,
      0,
      1,
      0
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
    WHERE
      CAST(o.status AS STRING) = 'completed' AND o.space_id IS NOT NULL
    UNION ALL
    SELECT
      CAST(o.space_id AS STRING) AS space_id,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH) AS action_month,
      0,
      0,
      1
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
    WHERE
      CAST(o.status AS STRING) IN ('canceled', 'rejected') AND o.space_id IS NOT NULL
  ),
  monthly_orders_raw AS (
    SELECT
      sh.complex_id,
      ra.action_month AS report_month,
      SUM(ra.is_opened) AS count_opened,
      SUM(ra.is_completed) AS count_completed,
      SUM(ra.is_canceled) AS count_canceled
    FROM
      Request_Actions AS ra
      JOIN
      space_timeline AS sh
      ON ra.space_id = sh.space_id
    WHERE
      ra.action_month IS NOT NULL
    GROUP BY 1, 2
  ),
  user_timeline AS (
    SELECT
      st.complex_id,
      st.space_id,
      st.owner_id AS space_owner_id,
      st.disconnect_date AS space_disconnect_date,
      CAST(u.id AS STRING) AS user_id,
      SAFE_CAST(u.created_at AS TIMESTAMP) AS user_created_at,
      SAFE_CAST(u.updated_at AS TIMESTAMP) AS user_updated_at,
      CAST(u.verified AS STRING) AS verified_str
    FROM
      space_timeline AS st
      JOIN
      `analytics-454817.postgresqldim9000.space_user` AS su
      ON st.space_id = CAST(su.space_id AS STRING)
      JOIN
      `analytics-454817.postgresqldim9000.users` AS u
      ON CAST(su.user_id AS STRING) = CAST(u.id AS STRING)
    WHERE
      CAST(u.role AS STRING) = 'ROLE_CITIZEN'
  ),
  monthly_real_users AS (
    SELECT
      ut.complex_id,
      cal.report_month,
      COUNT(DISTINCT ut.user_id) AS total_users_count,
      COUNT(DISTINCT
        CASE
          WHEN ut.verified_str IN ('true', '1') THEN ut.user_id
        END) AS confirmed_users_count,
      COUNT(DISTINCT
        CASE
          WHEN ut.verified_str IN ('true', '1') AND ut.user_id = ut.space_owner_id THEN ut.user_id
        END) AS owners_count,
      COUNT(DISTINCT
        CASE
          WHEN ut.verified_str IN ('true', '1') AND (ut.user_id != ut.space_owner_id OR ut.space_owner_id IS NULL) THEN ut.user_id
        END) AS residents_non_owners_count,
      COUNT(DISTINCT
        CASE
          WHEN ut.verified_str IN ('true', '1') AND DATE_TRUNC(DATE(ut.user_updated_at), MONTH) >= DATE_SUB(cal.report_month,
            INTERVAL 3 MONTH) THEN ut.user_id
        END) AS active_users_count
    FROM
      calendar AS cal
      JOIN
      user_timeline AS ut
      ON DATE_TRUNC(DATE(ut.user_created_at), MONTH) <= cal.report_month AND (ut.space_disconnect_date IS NULL OR
        cal.report_month < ut.space_disconnect_date)
    GROUP BY 1, 2
  ),
  monthly_infra AS (
    SELECT
      ht.complex_id,
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
          WHEN st.refined_kind != 'apartment' AND st.refined_kind NOT LIKE '%parking%' AND DATE_TRUNC(DATE(st.space_created_at),
            MONTH) <= cal.report_month AND (st.disconnect_date IS NULL OR cal.report_month < st.disconnect_date) THEN st.space_id
        END) AS commercials_count,
      COUNT(DISTINCT
        CASE
          WHEN st.refined_kind LIKE '%parking%' AND DATE_TRUNC(DATE(st.space_created_at), MONTH) <= cal.report_month AND
          (st.disconnect_date IS NULL OR cal.report_month < st.disconnect_date) THEN st.space_id
        END) AS parking_count
    FROM
      calendar AS cal
      JOIN
      house_timeline AS ht
      ON 1 = 1
      LEFT JOIN
      space_timeline AS st
      ON ht.house_id = st.house_id
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
      COALESCE(mu.total_users_count, 0) AS total_users_count,
      COALESCE(mu.confirmed_users_count, 0) AS confirmed_users_count,
      COALESCE(mu.owners_count, 0) AS owners_count,
      COALESCE(mu.residents_non_owners_count, 0) AS residents_non_owners_count,
      COALESCE(mu.active_users_count, 0) AS active_users_count,
      COALESCE(ord.count_opened, 0) AS count_opened,
      COALESCE(ord.count_completed, 0) AS count_completed,
      COALESCE(ord.count_canceled, 0) AS count_canceled
    FROM
      monthly_infra AS inf
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON inf.complex_id = CAST(c.id AS STRING)
      LEFT JOIN
      monthly_real_users AS mu
      ON inf.complex_id = mu.complex_id AND inf.report_month = mu.report_month
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
  apartments_count AS total_accounts,
  total_users_count,
  confirmed_users_count,
  owners_count,
  residents_non_owners_count,
  active_users_count,
  ROUND(SAFE_DIVIDE(confirmed_users_count, apartments_count) * 100, 1) AS conversion_pct,
  count_opened,
  count_completed,
  count_canceled,
  ROUND(SAFE_DIVIDE(count_completed, NULLIF(count_opened, 0)) * 100, 1) AS success_rate_pct,
  SUM(count_opened - count_completed - count_canceled) OVER (PARTITION BY complex_name
    ORDER BY reporting_period) AS backlog_requests
FROM
  final_join
