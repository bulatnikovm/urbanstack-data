-- Looker Studio custom SQL — product
-- datasource_id: 00b07e7a-beea-4091-a544-72a49cd11af9
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 93   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641, postgresqldim9000.users, postgresqldim9000.history_user_updates
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  Current_Prod_Version AS (
    SELECT
      version_name AS actual_version
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      event_time >= TIMESTAMP_SUB(`CURRENT_TIMESTAMP`(), INTERVAL 7 DAY) AND version_name IS NOT NULL
    GROUP BY version_name
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ),
  Deactivated_Users AS (
    SELECT DISTINCT
      u.phone AS phone_number
    FROM
      `analytics-454817.postgresqldim9000.history_user_updates` AS h
      JOIN
      `analytics-454817.postgresqldim9000.users` AS u
      ON h.user_id = u.id
    WHERE
      TO_JSON_STRING(h.after.roles) LIKE '%ROLE_INACTIVATED_CITIZEN%' AND u.phone IS NOT NULL
  ),
  User_Last_Event AS (
    SELECT
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      event_time AS last_active_time,
      version_name AS last_app_version,
      ROW_NUMBER() OVER (PARTITION BY JSON_VALUE(user_properties, '$.phone_number')
        ORDER BY event_time DESC) AS rn
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL AND JSON_VALUE(user_properties, '$.phone_number') !=
      ''
  ),
  User_Segmentation AS (
    SELECT
      u.phone_number,
      CASE
        WHEN d.phone_number IS NOT NULL THEN 'Деактивовані (Видалені з БД)'
        ELSE 'Потенційні (Можна повертати)'
      END AS user_lifecycle_status,
      CASE
        WHEN DATE_DIFF(`CURRENT_DATE`(), DATE(u.last_active_time), DAY) <= 30 THEN '1. Активні (< 1 міс)'
        WHEN DATE_DIFF(`CURRENT_DATE`(), DATE(u.last_active_time), DAY) <= 90 THEN '2. Сплячі (1-3 міс)'
        WHEN DATE_DIFF(`CURRENT_DATE`(), DATE(u.last_active_time), DAY) <= 180 THEN '3. Ризик відтоку (3-6 міс)'
        WHEN DATE_DIFF(`CURRENT_DATE`(), DATE(u.last_active_time), DAY) <= 365 THEN '4. Загублені (6-12 міс)'
        ELSE '5. Мертві душі (> 1 року)'
      END AS activity_segment,
      CASE
        WHEN u.last_app_version = p.actual_version THEN 'Актуальна версія'
        ELSE 'Стара версія'
      END AS version_status
    FROM
      User_Last_Event AS u
      LEFT JOIN
      Deactivated_Users AS d
      ON u.phone_number = d.phone_number
      CROSS JOIN
      Current_Prod_Version AS p
    WHERE
      u.rn = 1
  )
SELECT
  activity_segment,
  version_status,
  COUNT(phone_number) AS users_count
FROM
  User_Segmentation
WHERE
  user_lifecycle_status = 'Потенційні (Можна повертати)'
GROUP BY 1, 2
ORDER BY 1
