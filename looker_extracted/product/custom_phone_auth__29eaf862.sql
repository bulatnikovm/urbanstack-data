-- Looker Studio custom SQL — product
-- datasource_id: 29eaf862-ed3a-4c08-8cc9-121bb942c05e
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 147   first_seen: 2026-04-13   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  RawEvents AS (
    SELECT
      DATE_TRUNC(DATE(event_time), WEEK(MONDAY)) AS event_week,
      version_name AS app_version,
      platform AS os_type,
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      event_type
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      DATE(event_time) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE) AND
      DATE_TRUNC(DATE(event_time), WEEK(MONDAY)) <= DATE_TRUNC(`CURRENT_DATE`(), WEEK(MONDAY))
  ),
  UserWeeklyStats AS (
    SELECT
      event_week,
      app_version,
      os_type,
      phone_number,
      MAX(
        CASE
          WHEN event_type = 'news_scrn__view' THEN 1
          ELSE 0
        END) AS is_active_user,
      MAX(
        CASE
          WHEN event_type = 'auth_number_scrn__view' THEN 1
          ELSE 0
        END) AS saw_auth_screen,
      MAX(
        CASE
          WHEN event_type IN ('profile_profile_logout_confirm_tap', 'auth_pin_btn_reauth_tap', 'auth_pin_btn_forgot_tap') THEN 1
          ELSE 0
        END) AS did_voluntary_action,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_create_scrn__view' THEN 1
          ELSE 0
        END) AS is_new_registration
    FROM
      RawEvents
    WHERE
      phone_number IS NOT NULL
    GROUP BY 1, 2, 3, 4
  )
SELECT
  event_week,
  app_version,
  os_type,
  COUNT(DISTINCT
    CASE
      WHEN is_active_user = 1 THEN phone_number
    END) AS total_weekly_active_users,
  COUNT(DISTINCT
    CASE
      WHEN saw_auth_screen = 1 AND did_voluntary_action = 0 AND is_new_registration = 0 THEN phone_number
    END) AS users_with_forced_logout
FROM
  UserWeeklyStats
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2 DESC, 3
