-- Looker Studio custom SQL — product
-- datasource_id: 9f518bc4-016c-420b-9c8d-721593991f40
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 46   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  SessionDurations AS (
    SELECT
      session_id,
      JSON_VALUE(user_properties, '$.phone_number') AS user_id,
      DATE_TRUNC(DATE(MIN(event_time)), MONTH) AS event_month,
      TIMESTAMP_DIFF(MAX(event_time), MIN(event_time), SECOND) AS session_duration_sec
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      session_id IS NOT NULL AND session_id != -1 AND JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
    GROUP BY session_id, JSON_VALUE(user_properties, '$.phone_number')
    HAVING COUNT(event_time) > 1 AND TIMESTAMP_DIFF(MAX(event_time), MIN(event_time), SECOND) > 0 AND TIMESTAMP_DIFF(MAX(event_time),
      MIN(event_time), SECOND) < 14400
  ),
  UserMonthlyTotal AS (
    SELECT
      user_id,
      event_month,
      SUM(session_duration_sec) AS total_user_month_sec
    FROM
      SessionDurations
    GROUP BY user_id, event_month
  )
SELECT
  event_month,
  ROUND(APPROX_QUANTILES(total_user_month_sec, 100)[OFFSET(50)] / 60, 2) AS median_user_time_min,
  ROUND(APPROX_QUANTILES(total_user_month_sec, 100)[OFFSET(90)] / 60, 2) AS top_10_user_time_min,
  ROUND(AVG(total_user_month_sec) / 60, 2) AS avg_user_time_min
FROM
  UserMonthlyTotal
GROUP BY event_month
ORDER BY event_month DESC
