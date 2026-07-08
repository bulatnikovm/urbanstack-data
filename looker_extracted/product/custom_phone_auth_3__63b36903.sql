-- Looker Studio custom SQL — product
-- datasource_id: 63b36903-4c32-466e-80cd-1e4f9f250ff1
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 38   first_seen: 2026-04-13   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  RawEvents AS (
    SELECT
      DATE(event_time) AS event_date,
      event_time,
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      session_id,
      version_name,
      platform,
      event_type
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL AND DATE(event_time) BETWEEN DATE_SUB(PARSE_DATE('%Y%m%d',
          @DS_START_DATE), INTERVAL 30 DAY) AND PARSE_DATE('%Y%m%d', @DS_END_DATE) AND event_type IN ('auth_pin_scrn__view',
        'auth_pin_popup_face_touch_id_view', 'auth_pin_create_btn_face_biomid_id_skip_tap', 'auth_pin_text_field__type')
  ),
  LoyaltyCheck AS (
    SELECT
      *,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_popup_face_touch_id_view' THEN 1
          ELSE 0
        END) OVER (PARTITION BY phone_number
        ORDER BY UNIX_DATE(event_date) RANGE BETWEEN 30 PRECEDING AND 1 PRECEDING) AS is_loyal_bio_user
    FROM
      RawEvents
  ),
  SessionAggregations AS (
    SELECT
      event_date,
      platform,
      version_name,
      phone_number,
      session_id,
      MAX(is_loyal_bio_user) AS is_loyal_bio_user,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_scrn__view' THEN 1
          ELSE 0
        END) AS has_pin_screen,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_popup_face_touch_id_view' THEN 1
          ELSE 0
        END) AS has_bio_popup,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_create_btn_face_biomid_id_skip_tap' THEN 1
          ELSE 0
        END) AS has_skip,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_text_field__type' THEN 1
          ELSE 0
        END) AS has_pin_typing
    FROM
      LoyaltyCheck
    WHERE
      event_date BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE)
    GROUP BY 1, 2, 3, 4, 5
  )
SELECT
  DATE_TRUNC(event_date, WEEK(MONDAY)) AS event_week,
  platform,
  version_name,
  COUNT(DISTINCT
    CASE
      WHEN is_loyal_bio_user = 1 AND has_pin_screen = 1 THEN phone_number
    END) AS total_bio_users,
  COUNT(DISTINCT
    CASE
      WHEN is_loyal_bio_user = 1 AND has_pin_screen = 1 AND has_bio_popup = 0 AND has_skip = 0 THEN phone_number
    END) AS technical_friction_users,
  COUNT(DISTINCT
    CASE
      WHEN is_loyal_bio_user = 1 AND has_bio_popup = 1 AND has_skip = 0 AND has_pin_typing = 1 THEN phone_number
    END) AS biometric_fallback_users
FROM
  SessionAggregations
GROUP BY 1, 2, 3
ORDER BY event_week
