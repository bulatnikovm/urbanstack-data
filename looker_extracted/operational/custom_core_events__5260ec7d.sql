-- Looker Studio custom SQL — operational
-- datasource_id: 5260ec7d-3217-4344-bef9-8027aeedd9b5
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 285   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: postgresqldim9000.statistic_citizen, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.orders, postgresqldim9000.houses, postgresqldim9000.spaces
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  calendar AS (
    SELECT
      report_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE('2021-01-01'), DATE_TRUNC(`CURRENT_DATE`(), MONTH), INTERVAL 1 MONTH)) AS report_month
  ),
  all_complexes AS (
    SELECT
      id AS complex_id,
      name AS complex_name
    FROM
      `analytics-454817.postgresqldim9000.complexes`
  ),
  geo_mapping AS (
    SELECT
      s.id AS space_id,
      h.complex_id,
      s.kind,
      s.owner_id
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
  Orders_Translated AS (
    SELECT
      id,
      space_id,
      created_at,
      completed_at,
      updated_at,
      status,
      CASE LOWER(TRIM(category))
        WHEN 'adjacent_territory' THEN 'Прибудинкова територія'
        WHEN 'cleaning' THEN 'Клінінг'
        WHEN 'client_service' THEN 'Клієнтський сервіс'
        WHEN 'electricity' THEN 'Електрика'
        WHEN 'elevator' THEN 'Ліфти'
        WHEN 'financial_issues' THEN 'Фінансові питання'
        WHEN 'fire_protection_system' THEN 'Протипожежна система'
        WHEN 'heating' THEN 'Опалення'
        WHEN 'intercom_and_video' THEN 'Домофон та відеонагляд'
        WHEN 'other' THEN 'Інше'
        WHEN 'protection' THEN 'Охорона'
        WHEN 'repairs' THEN 'Ремонтні роботи'
        WHEN 'sewerage' THEN 'Каналізація'
        WHEN 'ventilation' THEN 'Вентиляція'
        WHEN 'water_supply' THEN 'Водопостачання'
        ELSE COALESCE(category, 'Без категорії')
      END AS category_ua,
      CASE LOWER(TRIM(type))
        WHEN 'client_question' THEN 'Запитання'
        WHEN 'client_offer' THEN 'Пропозиція'
        WHEN 'client_problem' THEN 'Проблема'
        WHEN 'client_service' THEN 'Послуга'
        WHEN 'client_complaint' THEN 'Скарга'
        ELSE COALESCE(type, 'Без типу')
      END AS type_ua
    FROM
      `analytics-454817.postgresqldim9000.orders`
  ),
  Request_Actions AS (
    SELECT
      g.complex_id,
      o.category_ua AS category,
      o.type_ua AS ticket_type,
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) AS action_month,
      1 AS is_opened,
      0 AS is_completed,
      0 AS is_canceled,
      0 AS is_completed_same_month,
      0 AS is_canceled_same_month
    FROM
      Orders_Translated AS o
      JOIN
      geo_mapping AS g
      ON o.space_id = g.space_id
    WHERE
      o.created_at IS NOT NULL
    UNION ALL
    SELECT
      g.complex_id,
      o.category_ua,
      o.type_ua,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH) AS action_month,
      0,
      1,
      0,
      CASE
        WHEN DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) = DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at,
              o.updated_at) AS TIMESTAMP)), MONTH) THEN 1
        ELSE 0
      END,
      0
    FROM
      Orders_Translated AS o
      JOIN
      geo_mapping AS g
      ON o.space_id = g.space_id
    WHERE
      o.status = 'completed'
    UNION ALL
    SELECT
      g.complex_id,
      o.category_ua,
      o.type_ua,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH) AS action_month,
      0,
      0,
      1,
      0,
      CASE
        WHEN DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) = DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at,
              o.updated_at) AS TIMESTAMP)), MONTH) THEN 1
        ELSE 0
      END
    FROM
      Orders_Translated AS o
      JOIN
      geo_mapping AS g
      ON o.space_id = g.space_id
    WHERE
      o.status IN ('canceled', 'rejected')
  ),
  order_stats AS (
    SELECT
      complex_id,
      action_month AS report_month,
      category,
      ticket_type,
      SUM(is_opened) AS count_opened,
      SUM(is_completed) AS count_completed,
      SUM(is_canceled) AS count_canceled,
      SUM(is_completed_same_month) AS count_completed_same_month,
      SUM(is_canceled_same_month) AS count_canceled_same_month
    FROM
      Request_Actions
    WHERE
      action_month IS NOT NULL
    GROUP BY 1, 2, 3, 4
  ),
  unique_dimensions AS (
    SELECT DISTINCT
      complex_id,
      category,
      ticket_type
    FROM
      order_stats
  ),
  report_backbone AS (
    SELECT
      c.report_month,
      d.complex_id,
      comp.complex_name,
      d.category,
      d.ticket_type
    FROM
      calendar AS c
      CROSS JOIN
      unique_dimensions AS d
      JOIN
      all_complexes AS comp
      ON d.complex_id = comp.complex_id
  ),
  citizen_stats AS (
    SELECT
      complex_id,
      event_month AS report_month,
      SUM(total) AS total_accounts_snapshot,
      SUM(active_user) AS active_app_users,
      SUM(confirmed_user) AS confirmed_app_users
    FROM
      (
        SELECT
          DATE(CAST(year AS INT64), CAST(month AS INT64), 1) AS event_month,
          complex_id,
          total,
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
          active_user,
          confirmed_user
        FROM
          `analytics-454817.postgresqldim9000.statistic_citizen`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY complex_id
          ORDER BY updated_at DESC) = 1
      )
    GROUP BY 1, 2
  ),
  actual_accounts AS (
    SELECT
      complex_id,
      COUNT(DISTINCT space_id) AS real_personal_accounts
    FROM
      geo_mapping
    WHERE
      kind = 'apartment' AND owner_id IS NOT NULL
    GROUP BY 1
  ),
  Final_Calculation AS (
    SELECT
      rb.report_month AS date,
      rb.complex_name,
      rb.category,
      rb.ticket_type,
      CAST(IFNULL(os.count_opened, 0) AS INT64) AS tickets_total,
      CAST(IFNULL(os.count_completed, 0) AS INT64) AS tickets_completed,
      CAST(IFNULL(os.count_canceled, 0) AS INT64) AS tickets_canceled,
      CAST(IFNULL(os.count_completed_same_month, 0) AS INT64) AS tickets_completed_same_month,
      CAST(IFNULL(os.count_canceled_same_month, 0) AS INT64) AS tickets_canceled_same_month,
      CAST(SUM(IFNULL(os.count_opened, 0) - IFNULL(os.count_completed, 0) - IFNULL(os.count_canceled, 0)) OVER (PARTITION BY
        rb.complex_id, rb.category, rb.ticket_type
        ORDER BY rb.report_month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS INT64) AS backlog_end_of_month,
      SAFE_DIVIDE(os.count_completed, os.count_opened) AS sla_rate,
      SAFE_DIVIDE(os.count_canceled, os.count_opened) AS cancel_rate,
      SAFE_DIVIDE(os.count_completed_same_month, os.count_opened) AS sla_rate_same_month,
      SAFE_DIVIDE(os.count_canceled_same_month, os.count_opened) AS cancel_rate_same_month,
      CASE
        WHEN ROW_NUMBER() OVER (PARTITION BY rb.report_month, rb.complex_id
          ORDER BY rb.category, rb.ticket_type) = 1 THEN CAST(IFNULL(aa.real_personal_accounts, 0) AS INT64)
        ELSE 0
      END AS personal_accounts,
      CASE
        WHEN ROW_NUMBER() OVER (PARTITION BY rb.report_month, rb.complex_id
          ORDER BY rb.category, rb.ticket_type) = 1 THEN CAST(IFNULL(cs.total_accounts_snapshot, 0) AS INT64)
        ELSE 0
      END AS total_accounts,
      CASE
        WHEN ROW_NUMBER() OVER (PARTITION BY rb.report_month, rb.complex_id
          ORDER BY rb.category, rb.ticket_type) = 1 THEN CAST(IFNULL(cs.confirmed_app_users, 0) AS INT64)
        ELSE 0
      END AS app_users,
      CASE
        WHEN ROW_NUMBER() OVER (PARTITION BY rb.report_month, rb.complex_id
          ORDER BY rb.category, rb.ticket_type) = 1 THEN CAST(IFNULL(cs.active_app_users, 0) AS INT64)
        ELSE 0
      END AS active_users,
      CASE
        WHEN ROW_NUMBER() OVER (PARTITION BY rb.report_month, rb.complex_id
          ORDER BY rb.category, rb.ticket_type) = 1 THEN SAFE_DIVIDE(cs.confirmed_app_users, cs.total_accounts_snapshot)
        ELSE NULL
      END AS app_adoption_rate
    FROM
      report_backbone AS rb
      LEFT JOIN
      order_stats AS os
      ON rb.report_month = os.report_month AND rb.complex_id = os.complex_id AND rb.category = os.category AND
        rb.ticket_type = os.ticket_type
      LEFT JOIN
      citizen_stats AS cs
      ON rb.report_month = cs.report_month AND rb.complex_id = cs.complex_id
      LEFT JOIN
      actual_accounts AS aa
      ON rb.complex_id = aa.complex_id
  )
SELECT
  *
FROM
  Final_Calculation
WHERE
  date BETWEEN SAFE.PARSE_DATE('%Y%m%d', CAST(@DS_START_DATE AS STRING)) AND SAFE.PARSE_DATE('%Y%m%d',
    CAST(@DS_END_DATE AS STRING))
ORDER BY date DESC, complex_name, category, ticket_type
