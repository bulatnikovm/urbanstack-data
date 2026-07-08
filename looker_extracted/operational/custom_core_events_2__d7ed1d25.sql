-- Looker Studio custom SQL — operational
-- datasource_id: d7ed1d25-70a0-4e29-926e-272d44236bfa
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 235   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: postgresqldim9000.spaces, postgresqldim9000.orders, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  calendar AS (
    SELECT
      report_month AS event_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE('2021-01-01'), DATE_TRUNC(`CURRENT_DATE`(), MONTH), INTERVAL 1 MONTH)) AS report_month
  ),
  space_hierarchy AS (
    SELECT
      s.id AS space_id,
      h.complex_id,
      c.name AS complex_name
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON h.complex_id = c.id
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
      o.id AS request_id,
      sh.complex_id,
      sh.complex_name,
      sh.space_id,
      o.category_ua AS category,
      o.type_ua AS ticket_type,
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) AS action_month,
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH) AS created_month,
      '1_Opened' AS action_type
    FROM
      Orders_Translated AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.created_at IS NOT NULL
    UNION ALL
    SELECT
      o.id,
      sh.complex_id,
      sh.complex_name,
      sh.space_id,
      o.category_ua,
      o.type_ua,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH),
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH),
      '2_Completed'
    FROM
      Orders_Translated AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.status = 'completed'
    UNION ALL
    SELECT
      o.id,
      sh.complex_id,
      sh.complex_name,
      sh.space_id,
      o.category_ua,
      o.type_ua,
      DATE_TRUNC(DATE(SAFE_CAST(COALESCE(o.completed_at, o.updated_at) AS TIMESTAMP)), MONTH),
      DATE_TRUNC(DATE(SAFE_CAST(o.created_at AS TIMESTAMP)), MONTH),
      '3_Canceled'
    FROM
      Orders_Translated AS o
      JOIN
      space_hierarchy AS sh
      ON o.space_id = sh.space_id
    WHERE
      o.status IN ('canceled', 'rejected')
  ),
  Monthly_Agg AS (
    SELECT
      action_month AS event_month,
      complex_id,
      complex_name,
      space_id,
      category,
      ticket_type,
      SUM(
        CASE
          WHEN action_type = '1_Opened' THEN 1
          ELSE 0
        END) AS count_opened,
      SUM(
        CASE
          WHEN action_type = '2_Completed' THEN 1
          ELSE 0
        END) AS count_completed,
      SUM(
        CASE
          WHEN action_type = '3_Canceled' THEN 1
          ELSE 0
        END) AS count_canceled,
      SUM(
        CASE
          WHEN action_type = '2_Completed' AND action_month = created_month THEN 1
          ELSE 0
        END) AS count_completed_same_month,
      SUM(
        CASE
          WHEN action_type = '3_Canceled' AND action_month = created_month THEN 1
          ELSE 0
        END) AS count_canceled_same_month
    FROM
      Request_Actions
    WHERE
      action_month IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5, 6
  ),
  Unique_Dimensions AS (
    SELECT DISTINCT
      complex_id,
      complex_name,
      space_id,
      category,
      ticket_type
    FROM
      Monthly_Agg
  ),
  Calculated_Backlog AS (
    SELECT
      c.event_month,
      d.complex_id,
      d.complex_name,
      d.space_id,
      d.category,
      d.ticket_type,
      COALESCE(m.count_opened, 0) AS count_opened,
      COALESCE(m.count_completed, 0) AS count_completed,
      COALESCE(m.count_canceled, 0) AS count_canceled,
      COALESCE(m.count_completed_same_month, 0) AS count_completed_same_month,
      COALESCE(m.count_canceled_same_month, 0) AS count_canceled_same_month,
      SUM(COALESCE(m.count_opened, 0) - COALESCE(m.count_completed, 0) - COALESCE(m.count_canceled, 0)) OVER (PARTITION BY
        d.complex_id, d.space_id, d.category, d.ticket_type
        ORDER BY c.event_month) AS in_progress_end_of_month
    FROM
      calendar AS c
      CROSS JOIN
      Unique_Dimensions AS d
      LEFT JOIN
      Monthly_Agg AS m
      ON c.event_month = m.event_month AND d.complex_id = m.complex_id AND d.space_id = m.space_id AND d.category =
        m.category AND d.ticket_type = m.ticket_type
  )
SELECT
  event_month,
  complex_id,
  complex_name,
  space_id,
  category,
  ticket_type,
  CAST(count_opened AS INT64) AS opened_requests,
  CAST(count_completed AS INT64) AS completed_requests,
  CAST(count_canceled AS INT64) AS canceled_requests,
  CAST(count_completed_same_month AS INT64) AS completed_same_month_requests,
  CAST(count_canceled_same_month AS INT64) AS canceled_same_month_requests,
  CAST(in_progress_end_of_month AS INT64) AS backlog_requests
FROM
  Calculated_Backlog
WHERE
  event_month BETWEEN SAFE.PARSE_DATE('%Y%m%d', CAST(@DS_START_DATE AS STRING)) AND SAFE.PARSE_DATE('%Y%m%d',
    CAST(@DS_END_DATE AS STRING))
ORDER BY event_month DESC
