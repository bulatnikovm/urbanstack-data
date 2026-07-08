-- Looker Studio custom SQL — report_3e82a516_orders
-- datasource_id: bfc81416-75de-41bb-8671-6fdcc7734087
-- report_id: 3e82a516-32b2-4534-80ff-b8db6b584a94
-- type: custom
-- runs(90d): 16   first_seen: 2026-05-21   last_seen: 2026-05-27
-- referenced_tables: postgresqldim9000.statistic_citizen, postgresqldim9000.spaces, postgresqldim9000.sections, postgresqldim9000.houses, postgresqldim9000.orders, postgresqldim9000.complexes
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
  calendar AS (
    SELECT
      report_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE('2024-01-01'), DATE_TRUNC(`CURRENT_DATE`(), MONTH), INTERVAL 1 MONTH)) AS report_month
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
  ),
  clean_spaces AS (
    SELECT
      s.id AS space_id,
      h.complex_id,
      DATE(s.created_at) AS created_at
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
    WHERE
      h.id NOT IN (
        SELECT
          house_id
        FROM
          excluded_houses
      )
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
      ON rb.complex_id = cs.complex_id AND cs.created_at <= rb.report_month
    GROUP BY 1, 2
  ),
  order_stats AS (
    SELECT
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      cs.complex_id,
      COUNT(DISTINCT
        CASE
          WHEN o.status != 'canceled' THEN o.id
        END) AS total_orders,
      COUNT(DISTINCT
        CASE
          WHEN o.status = 'completed' THEN o.id
        END) AS completed_orders,
      COUNT(DISTINCT
        CASE
          WHEN o.status = 'canceled' THEN o.id
        END) AS canceled_orders
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      clean_spaces AS cs
      ON o.space_id = cs.space_id
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
      os.total_orders,
      os.completed_orders,
      os.canceled_orders,
      cs.raw_confirmed_users,
      cs.raw_active_users,
      cs.raw_total_accounts,
      CASE
        WHEN rb.report_month = MAX(rb.report_month) OVER () THEN
        CASE
          WHEN rb.complex_name = 'ЖК "Варшавський"' THEN 4372
          WHEN rb.complex_name = 'ЖК "Варшавський 2"' THEN 2471
          ELSE IFNULL(ac.total_accounts, 0)
        END
        ELSE IFNULL(ac.total_accounts, 0)
      END AS final_total_accounts
    FROM
      report_backbone AS rb
      LEFT JOIN
      clean_account_counts AS ac
      ON rb.report_month = ac.report_month AND rb.complex_id = ac.complex_id
      LEFT JOIN
      order_stats AS os
      ON rb.report_month = os.report_month AND rb.complex_id = os.complex_id
      LEFT JOIN
      citizen_stats_raw AS cs
      ON rb.report_month = cs.report_month AND rb.complex_id = cs.complex_id
  )
SELECT
  report_month AS date,
  complex_name,
  IFNULL(total_orders, 0) AS tickets_total,
  IFNULL(completed_orders, 0) AS tickets_completed,
  IFNULL(canceled_orders, 0) AS tickets_canceled,
  SAFE_DIVIDE(completed_orders, total_orders) AS sla_rate,
  final_total_accounts AS total_accounts,
  CAST(ROUND(IFNULL(raw_confirmed_users, 0) * SAFE_DIVIDE(final_total_accounts, NULLIF(raw_total_accounts,
        1))) AS INT64) AS app_users,
  CAST(ROUND(IFNULL(raw_active_users, 0) * SAFE_DIVIDE(final_total_accounts, NULLIF(raw_total_accounts,
        1))) AS INT64) AS active_users,
  SAFE_DIVIDE(IFNULL(raw_confirmed_users, 0) * SAFE_DIVIDE(final_total_accounts, NULLIF(raw_total_accounts,
        1)), NULLIF(final_total_accounts, 0)) AS app_adoption_rate,
  SUM(
    CASE
      WHEN complex_name IN ('ЖК Great', 'ЖК Oakland') THEN 0
      ELSE final_total_accounts
    END) OVER (PARTITION BY report_month) AS total_monthly_accounts_fixed,
  CASE
    WHEN report_month = MAX(report_month) OVER () THEN
    CASE
      WHEN complex_name IN ('ЖК Great', 'ЖК Oakland') THEN 0
      ELSE final_total_accounts
    END
    ELSE NULL
  END AS total_accounts_latest
FROM
  pre_final
WHERE
  report_month <= `CURRENT_DATE`()
ORDER BY date DESC, complex_name
