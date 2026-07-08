-- Looker Studio custom SQL — operational
-- datasource_id: 8677b241-b522-4661-8f6c-f6c01b23810e
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 205   first_seen: 2026-04-09   last_seen: 2026-06-30
-- referenced_tables: postgresqldim9000.orders, postgresqldim9000.sections, postgresqldim9000.houses, postgresqldim9000.space_commercials, postgresqldim9000.complexes, postgresqldim9000.spaces
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
  House_Sizes AS (
    SELECT
      h.id AS house_id,
      CASE
        WHEN sc.id IS NOT NULL AND sc.type = 'parking' THEN 'Паркінг'
        WHEN sc.id IS NOT NULL THEN 'Комерція'
        WHEN LOWER(s.kind) = 'apartment' THEN 'Квартира'
        WHEN LOWER(s.kind) = 'commercial' THEN 'Комерція'
        WHEN LOWER(s.kind) = 'parking' THEN 'Паркінг'
        ELSE 'Інше'
      END AS object_type,
      COUNT(DISTINCT s.id) AS total_spaces
    FROM
      `analytics-454817.postgresqldim9000.houses` AS h
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON h.id = sec.house_id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.spaces` AS s
      ON sec.id = s.section_id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_commercials` AS sc
      ON s.id = sc.id
    GROUP BY 1, 2
  ),
  Complex_Sizes AS (
    SELECT
      c.name AS complex_name,
      CASE
        WHEN sc.id IS NOT NULL AND sc.type = 'parking' THEN 'Паркінг'
        WHEN sc.id IS NOT NULL THEN 'Комерція'
        WHEN LOWER(s.kind) = 'apartment' THEN 'Квартира'
        WHEN LOWER(s.kind) = 'commercial' THEN 'Комерція'
        WHEN LOWER(s.kind) = 'parking' THEN 'Паркінг'
        ELSE 'Інше'
      END AS object_type,
      COUNT(DISTINCT s.id) AS complex_total_spaces
    FROM
      `analytics-454817.postgresqldim9000.complexes` AS c
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON c.id = h.complex_id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON h.id = sec.house_id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.spaces` AS s
      ON sec.id = s.section_id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_commercials` AS sc
      ON s.id = sc.id
    WHERE
      c.id != '09c50e9a-7685-435d-ac36-4934aa7fd39c' AND NOT((c.name = 'ЖК "Ліпінка"' AND CAST(h.number AS STRING) =
      '108') OR (c.name LIKE '%Варшавський%' AND CAST(h.number AS STRING) IN ('20', '20-А', '20-Б')) OR
      (c.name = 'ЖК "Севен"' AND CAST(h.number AS STRING) IN ('16-Г', '16-Д', '18-А', '18-Б', '20-А',
        '20-Б'))) AND (h.id IS NULL OR h.id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      ))
    GROUP BY 1, 2
  ),
  Category_Stats AS (
    SELECT
      c.name AS complex_name,
      h.id AS house_id,
      CAST(h.number AS STRING) AS house_number,
      CASE
        WHEN sc.id IS NOT NULL AND sc.type = 'parking' THEN 'Паркінг'
        WHEN sc.id IS NOT NULL THEN 'Комерція'
        WHEN LOWER(s.kind) = 'apartment' THEN 'Квартира'
        WHEN LOWER(s.kind) = 'commercial' THEN 'Комерція'
        WHEN LOWER(s.kind) = 'parking' THEN 'Паркінг'
        ELSE 'Інше'
      END AS object_type,
      CASE
        WHEN o.type IS NULL THEN 'Системна / Аварійна'
        WHEN LOWER(o.type) = 'client_problem' THEN 'Проблема'
        WHEN LOWER(o.type) = 'client_question' THEN 'Питання'
        WHEN LOWER(o.type) = 'client_offer' THEN 'Пропозиція'
        WHEN LOWER(o.type) = 'client_complaint' THEN 'Скарга'
        WHEN LOWER(o.type) = 'client_service' THEN 'Клієнт сервіс'
        ELSE 'Не вказано'
      END AS request_type,
      CASE o.category
        WHEN 'financial_issues' THEN '01. Фінансові питання'
        WHEN 'electricity' THEN '02. Електроенергія'
        WHEN 'client_service' THEN '03. Клієнт сервіс'
        WHEN 'heating' THEN '04. Опалення'
        WHEN 'adjacent_territory' THEN '05. Будинок і територія'
        WHEN 'water_supply' THEN '06. Водопостачання'
        WHEN 'elevator' THEN '07. Ліфти'
        WHEN 'repairs' THEN '08. Ремонтні роботи'
        WHEN 'cleaning' THEN '09. Прибирання'
        WHEN 'intercom_and_video' THEN '10. Домофон та відео'
        WHEN 'protection' THEN '11. Охорона'
        WHEN 'ventilation' THEN '12. Вентиляція'
        WHEN 'sewerage' THEN '13. Каналізація'
        WHEN 'fire_protection_system' THEN '14. Пожежна система'
        WHEN 'other' THEN '15. Інше'
        ELSE COALESCE(o.category, 'Без категорії')
      END AS issue_category,
      COUNT(o.id) AS tickets_count
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      LEFT JOIN
      `analytics-454817.postgresqldim9000.spaces` AS s
      ON o.space_id = s.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.space_commercials` AS sc
      ON s.id = sc.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS s_sec
      ON s.section_id = s_sec.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON s_sec.house_id = h.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON h.complex_id = c.id
    WHERE
      o.space_id IS NOT NULL AND c.name IS NOT NULL AND c.id != '09c50e9a-7685-435d-ac36-4934aa7fd39c' AND
      NOT((c.name = 'ЖК "Ліпінка"' AND CAST(h.number AS STRING) = '108') OR (c.name LIKE '%Варшавський%' AND
      CAST(h.number AS STRING) IN ('20', '20-А', '20-Б')) OR (c.name = 'ЖК "Севен"' AND CAST(h.number AS STRING) IN
      ('16-Г', '16-Д', '18-А', '18-Б', '20-А', '20-Б'))) AND (h.id IS NULL OR h.id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      )) AND LOWER(COALESCE(o.status, '')) NOT IN ('canceled', 'cancelled', 'rejected')
    GROUP BY 1, 2, 3, 4, 5, 6
  )
SELECT
  cs.complex_name,
  cs.house_number,
  CONCAT(cs.complex_name, ' (буд. ', cs.house_number, ')') AS full_house_name,
  cs.object_type,
  cs.request_type,
  cs.issue_category,
  cs.tickets_count,
  hs.total_spaces AS house_total_spaces,
  cx.complex_total_spaces
FROM
  Category_Stats AS cs
  LEFT JOIN
  House_Sizes AS hs
  ON cs.house_id = hs.house_id AND cs.object_type = hs.object_type
  LEFT JOIN
  Complex_Sizes AS cx
  ON cs.complex_name = cx.complex_name AND cs.object_type = cx.object_type
