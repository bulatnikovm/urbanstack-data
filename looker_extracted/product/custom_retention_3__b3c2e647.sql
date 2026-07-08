-- Looker Studio custom SQL — product
-- datasource_id: b3c2e647-fa20-4cfd-8c9a-e06258043c43
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 117   first_seen: 2026-04-13   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  RawEvents AS (
    SELECT
      DATE(event_time) AS event_date,
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      version_name,
      platform,
      event_type,
      event_time
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      DATE(event_time) BETWEEN DATE_SUB(PARSE_DATE('%Y%m%d', @DS_START_DATE), INTERVAL 30 DAY) AND PARSE_DATE('%Y%m%d',
        @DS_END_DATE) AND JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
  ),
  UserCohort AS (
    SELECT
      *,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_popup_face_touch_id_view' THEN 1
          ELSE 0
        END) OVER (PARTITION BY phone_number
        ORDER BY UNIX_DATE(event_date) RANGE BETWEEN 30 PRECEDING AND 1 PRECEDING) AS is_loyal_bio_user,
      MAX(
        CASE
          WHEN event_type = 'auth_pin_create_btn_face_biomid_id_skip_tap' THEN 1
          ELSE 0
        END) OVER (PARTITION BY phone_number, DATE_TRUNC(event_date, WEEK(MONDAY))) AS week_skipped_bio
    FROM
      RawEvents
  )
SELECT
  DATE_TRUNC(event_date, WEEK(MONDAY)) AS event_week,
  platform,
  version_name,
  COUNT(DISTINCT
    CASE
      WHEN is_loyal_bio_user = 1 THEN phone_number
    END) AS loyal_bio_users_active,
  COUNT(DISTINCT
    CASE
      WHEN is_loyal_bio_user = 1 AND event_type = 'auth_pin_scrn__view' AND week_skipped_bio = 0 AND phone_number NOT IN
      (
        SELECT
          phone_number
        FROM
          RawEvents AS re
        WHERE
          re.event_type = 'auth_pin_popup_face_touch_id_view' AND re.event_date = UserCohort.event_date
      ) THEN phone_number
    END) AS technical_friction_users
FROM
  UserCohort
WHERE
  event_date BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE)
GROUP BY 1, 2, 3
ORDER BY event_week DESC, version_name DESC, platform
