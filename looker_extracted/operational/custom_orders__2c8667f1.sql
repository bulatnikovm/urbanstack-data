-- Looker Studio custom SQL — operational
-- datasource_id: 2c8667f1-196a-45e6-a6cb-0aab29becac8
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 76   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: -
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  excluded_houses AS (
    SELECT
      id
    FROM
      UNNEST(ARRAY['e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649', '6017b015-6916-41db-9404-dd5b0885434b',
      'ef446c3b-c38f-4fa2-a887-9633fbba4071', '91aa654b-f87c-48fe-b144-2fa8fd9932df', '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2',
      'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f', '18c381e0-afa9-4b7f-82cd-9d005dca90e1',
      '0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21']) AS id
  ),
  Category_Map AS (
    SELECT
      *
    FROM
      UNNEST(ARRAY[STRUCT('cleaning' AS key, 'Прибирання' AS label), STRUCT('water_supply', 'Водопостачання'),
      STRUCT('elevator', 'Ліфт'), STRUCT('heating', 'Опалення'), STRUCT('fire_protection_system',
        'Протипожежна система'), STRUCT('electricity', 'Електроенергія'), STRUCT('sewerage',
        'Каналізація'), STRUCT('repairs', 'Ремонтні роботи'), STRUCT('intercom', 'Домофон'),
      STRUCT('intercom_and_video', 'Домофон, відео, СКД'), STRUCT('adjacent_territory', 'Будинок і територія'),
      STRUCT('protection', 'Охорона'), STRUCT('financial_issues', 'Фінансові питання'),
      STRUCT('ventilation', 'Вентиляція'), STRUCT('client_service', 'Клієнт сервіс'),
      STRUCT('other', 'Інші питання')])
  ),
  Type_Map AS (
    SELECT
      *
    FROM
      UNNEST(ARRAY[STRUCT('client_problem' AS key, 'Проблема' AS label), STRUCT('client_question',
        'Питання'), STRUCT('client_offer', 'Пропозиція'), STRUCT('client_complaint', 'Скарга'),
      STRUCT('client_service', 'Клієнт сервіс')])
  ),
  geo_mapping AS (
    SELECT
      s.id AS space_id,
      c.name AS complex_name,
      h.number AS house_number,
      h.id AS house_id
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON h.complex_id = c.id
  ),
  All_Orders AS (
    SELECT
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      g.complex_name,
      g.house_number,
      COALESCE(cm.label, o.category, 'Інше') AS category_name,
      COALESCE(tm.label, 'Не вказано') AS request_type,
      o.id AS order_id
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      LEFT JOIN
      geo_mapping AS g
      ON o.space_id = g.space_id
      LEFT JOIN
      Category_Map AS cm
      ON o.category = cm.key
      LEFT JOIN
      Type_Map AS tm
      ON o.type = tm.key
    WHERE
      LOWER(COALESCE(o.status, '')) NOT IN ('canceled', 'cancelled', 'rejected') AND (g.house_id IS NULL OR
      g.house_id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      ))
  ),
  Aggregated_Stats AS (
    SELECT
      report_month,
      complex_name,
      house_number,
      category_name,
      request_type,
      COUNT(DISTINCT order_id) AS quantity
    FROM
      All_Orders
    GROUP BY 1, 2, 3, 4, 5
  )
SELECT
  report_month,
  complex_name,
  house_number,
  category_name,
  request_type,
  quantity,
  SUM(quantity) OVER (PARTITION BY report_month, complex_name) AS total_monthly_orders_in_complex,
  ROUND(SAFE_DIVIDE(quantity, SUM(quantity) OVER (PARTITION BY report_month, complex_name)) * 100, 2) AS share_in_complex_percent
FROM
  Aggregated_Stats
ORDER BY report_month DESC, quantity DESC
