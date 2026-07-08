-- Looker Studio custom SQL — product
-- datasource_id: f5c03f68-0403-4140-bbcd-e4c872a72061
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 105   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  Raw_Events AS (
    SELECT
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      event_type AS event_name,
      DATE(event_time) AS event_date
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL AND JSON_VALUE(user_properties, '$.phone_number') !=
      ''
  ),
  Mapped_Events AS (
    SELECT
      phone_number,
      event_date,
      CASE
        WHEN event_name = 'news_details_scrn__view' THEN '1. Новини (Читання)'
        WHEN event_name IN ('news_scrn__view', 'news_scrn__scroll', 'news_card_urgent_view', 'news_card_urgent_tap') THEN '1. Новини (Головна)'
        WHEN event_name IN ('keys_main_scrn__view', 'key_open_btn__click', 'widget_home_key_btn__click') THEN '2. СКД (Доступ)'
        WHEN event_name IN ('finances_receipts_scrn__view', 'finances_archive_scrn__view', 'active_receipt_scrn__view',
          'active_receipt_btn_payment_tap', 'active_receipt_popup_payment_success_view', 'completed_receipt_scrn__view') THEN '3. Оплати'
        WHEN event_name LIKE 'paid_service_%' OR event_name LIKE 'services_%' THEN '4. Платні послуги'
        WHEN event_name LIKE 'requests_%' OR event_name LIKE 'request_new_%' OR event_name LIKE 'request_chat_%' THEN '5. Безкоштовні заявки'
        WHEN event_name LIKE 'vote_%' THEN '6. Голосування'
        WHEN event_name LIKE 'profile_%' OR event_name LIKE 'auth_%' OR event_name LIKE 'onboarding_%' THEN '7. Профіль'
        ELSE 'Інше'
      END AS module_group
    FROM
      Raw_Events
  ),
  Global_Activity AS (
    SELECT
      phone_number,
      MAX(event_date) AS global_last_active_date
    FROM
      Raw_Events
    GROUP BY 1
  ),
  User_Module_Lifecycle AS (
    SELECT
      m.phone_number,
      m.module_group,
      g.global_last_active_date,
      MIN(m.event_date) AS first_use_date,
      MAX(m.event_date) AS last_use_date,
      COUNT(DISTINCT m.event_date) AS active_days_count,
      COUNT(m.event_date) AS total_events
    FROM
      Mapped_Events AS m
      JOIN
      Global_Activity AS g
      ON m.phone_number = g.phone_number
    WHERE
      m.module_group != 'Інше'
    GROUP BY 1, 2, 3
  ),
  Lifecycle_Metrics AS (
    SELECT
      phone_number,
      module_group,
      DATE_DIFF(last_use_date, first_use_date, DAY) AS lifetime_days,
      active_days_count,
      total_events,
      CASE
        WHEN DATE_DIFF(`CURRENT_DATE`(), global_last_active_date, DAY) > 60 THEN 1
        ELSE 0
      END AS is_app_churned,
      CASE
        WHEN module_group = '2. СКД (Доступ)' THEN
        CASE
          WHEN DATE_DIFF(`CURRENT_DATE`(), last_use_date, DAY) > 30 THEN 1
          ELSE 0
        END
        WHEN module_group IN ('3. Оплати', '4. Платні послуги', '5. Безкоштовні заявки') THEN
        CASE
          WHEN DATE_DIFF(`CURRENT_DATE`(), last_use_date, DAY) > 90 THEN 1
          ELSE 0
        END
        WHEN module_group = '6. Голосування' THEN
        CASE
          WHEN DATE_DIFF(`CURRENT_DATE`(), last_use_date, DAY) > 180 THEN 1
          ELSE 0
        END
        ELSE
        CASE
          WHEN DATE_DIFF(`CURRENT_DATE`(), last_use_date, DAY) > 30 THEN 1
          ELSE 0
        END
      END AS is_module_dropped_off
    FROM
      User_Module_Lifecycle
  )
SELECT
  CASE
    WHEN module_group = '2. СКД (Доступ)' THEN '2. СКД (Доступ) [30 днів]'
    WHEN module_group IN ('3. Оплати', '4. Платні послуги', '5. Безкоштовні заявки') THEN CONCAT(module_group,
      ' [90 днів]')
    WHEN module_group = '6. Голосування' THEN '6. Голосування [180 днів]'
    ELSE CONCAT(module_group, ' [30 днів]')
  END AS module_group,
  COUNT(phone_number) AS total_users_tried,
  SAFE_DIVIDE(SUM(
      CASE
        WHEN is_app_churned = 0 AND is_module_dropped_off = 1 THEN 1
        ELSE 0
      END), SUM(
      CASE
        WHEN is_app_churned = 0 THEN 1
        ELSE 0
      END)) AS true_module_drop_off_rate,
  SAFE_DIVIDE(SUM(is_app_churned), COUNT(phone_number)) AS app_churn_rate,
  APPROX_QUANTILES(
    CASE
      WHEN is_app_churned = 0 AND is_module_dropped_off = 1 THEN lifetime_days
    END, 100)[OFFSET(50)] AS median_days_before_drop,
  ROUND(AVG(SAFE_DIVIDE(lifetime_days, NULLIF(active_days_count - 1, 0))), 1) AS avg_days_between_sessions
FROM
  Lifecycle_Metrics
GROUP BY 1
ORDER BY module_group
