-- Looker Studio custom SQL — product
-- datasource_id: bc3b2d0d-0d9c-4bd5-8078-e4c40f99c642
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 59   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: -
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  Raw_Events AS (
    SELECT
      DATE_TRUNC(DATE(event_time), MONTH) AS event_month,
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number_raw,
      amplitude_id,
      session_id,
      event_type AS event_name,
      event_time
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      DATE(event_time) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE)
  ),
  Cleaned_Users AS (
    SELECT
      *,
      CASE
        WHEN phone_number_raw IS NOT NULL AND phone_number_raw NOT LIKE '%unknown%' AND phone_number_raw != '' THEN phone_number_raw
        ELSE CONCAT('guest_', CAST(amplitude_id AS STRING))
      END AS real_user_id
    FROM
      Raw_Events
  ),
  Events_With_Duration AS (
    SELECT
      *,
      TIMESTAMP_DIFF(LEAD(event_time) OVER (PARTITION BY session_id
          ORDER BY event_time), event_time, SECOND) AS duration_seconds
    FROM
      Cleaned_Users
  ),
  Mapped_Events AS (
    SELECT
      event_month,
      real_user_id,
      CASE
        WHEN duration_seconds IS NULL THEN 5
        WHEN duration_seconds > 1800 THEN 300
        ELSE duration_seconds
      END AS final_duration,
      CASE
        WHEN event_name = 'news_details_scrn__view' THEN '1. Новини (Читання)'
        WHEN event_name IN ('news_scrn__view', 'news_scrn__scroll', 'news_card_urgent_view', 'news_card_urgent_tap') THEN '1. Новини (Головна)'
        WHEN event_name IN ('keys_main_scrn__view', 'key_open_btn__click', 'widget_home_key_btn__click') THEN '2. СКД (Доступ)'
        WHEN event_name IN ('finances_receipts_scrn__view', 'finances_archive_scrn__view', 'active_receipt_scrn__view',
          'active_receipt_btn_payment_tap', 'active_receipt_popup_payment_success_view', 'completed_receipt_scrn__view') THEN '3. Оплати'
        WHEN event_name LIKE 'paid_service_%' OR event_name LIKE 'services_%' THEN '4. Платні послуги'
        WHEN event_name LIKE 'requests_%' OR event_name LIKE 'request_new_%' OR event_name LIKE 'request_chat_%' THEN '5. Безкоштовні заявки'
        WHEN event_name LIKE 'vote_%' THEN '6. Голосування'
        WHEN event_name LIKE 'profile_%' OR event_name LIKE 'auth_%' OR event_name LIKE 'onboarding_%' THEN '7. Профіль та Авторизація'
        ELSE 'Інше'
      END AS module_group
    FROM
      Events_With_Duration
  ),
  User_Module_Stats AS (
    SELECT
      event_month,
      real_user_id,
      module_group,
      SUM(final_duration) AS user_time_in_module_sec
    FROM
      Mapped_Events
    WHERE
      module_group != 'Інше'
    GROUP BY 1, 2, 3
  ),
  Total_MAU AS (
    SELECT
      event_month,
      COUNT(DISTINCT real_user_id) AS total_active_users
    FROM
      Mapped_Events
    GROUP BY 1
  )
SELECT
  S.event_month,
  S.module_group,
  COUNT(DISTINCT S.real_user_id) AS module_users,
  SAFE_DIVIDE(COUNT(DISTINCT S.real_user_id), ANY_VALUE(M.total_active_users)) AS penetration_rate,
  ROUND(APPROX_QUANTILES(S.user_time_in_module_sec, 100)[OFFSET(50)] / 60, 2) AS median_time_min,
  ROUND(APPROX_QUANTILES(S.user_time_in_module_sec, 100)[OFFSET(90)] / 60, 2) AS top_users_time_min
FROM
  User_Module_Stats AS S
  LEFT JOIN
  Total_MAU AS M
  ON S.event_month = M.event_month
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC
