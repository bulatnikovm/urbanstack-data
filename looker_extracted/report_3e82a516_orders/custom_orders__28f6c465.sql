-- Looker Studio custom SQL — report_3e82a516_orders
-- datasource_id: 28f6c465-2d9e-4061-aede-98d75e4aaa58
-- report_id: 3e82a516-32b2-4534-80ff-b8db6b584a94
-- type: custom
-- runs(90d): 32   first_seen: 2026-05-21   last_seen: 2026-06-09
-- referenced_tables: postgresqldim9000.sections, postgresqldim9000.houses, postgresqldim9000.orders, postgresqldim9000.complexes, postgresqldim9000.spaces
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
  geo_mapping AS (
    SELECT
      s.id AS space_id,
      c.name AS complex_name,
      c.id AS complex_id
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
    WHERE
      h.id NOT IN (
        SELECT
          house_id
        FROM
          excluded_houses
      ) AND c.id NOT IN (
        SELECT
          id
        FROM
          excluded_complexes
      )
  ),
  All_Orders AS (
    SELECT
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      g.complex_name,
      COALESCE(cm.label, o.category) AS category_name,
      o.id AS order_id
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      JOIN
      geo_mapping AS g
      ON o.space_id = g.space_id
      LEFT JOIN
      Category_Map AS cm
      ON o.category = cm.key
    WHERE
      LOWER(o.status) NOT IN ('canceled', 'cancelled')
  ),
  Aggregated_Stats AS (
    SELECT
      report_month,
      complex_name,
      category_name,
      COUNT(DISTINCT order_id) AS quantity
    FROM
      All_Orders
    GROUP BY 1, 2, 3
  )
SELECT
  report_month,
  complex_name,
  category_name,
  quantity,
  SUM(quantity) OVER (PARTITION BY report_month, complex_name) AS total_monthly_orders,
  SUM(quantity) OVER (PARTITION BY report_month) AS total_company_orders,
  SAFE_DIVIDE(quantity, SUM(quantity) OVER (PARTITION BY report_month, complex_name)) AS share_ratio
FROM
  Aggregated_Stats
ORDER BY report_month DESC, quantity DESC
