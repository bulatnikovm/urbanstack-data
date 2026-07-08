-- Looker Studio custom SQL — product
-- datasource_id: 3528e8f5-4e79-407d-a59a-f14fb0b3f2de
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 138   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  SessionDurations AS (
    SELECT
      amplitude_id,
      session_id,
      DATE_TRUNC(DATE(MIN(event_time)), MONTH) AS event_month,
      TIMESTAMP_DIFF(MAX(event_time), MIN(event_time), SECOND) AS duration_sec
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      session_id IS NOT NULL AND session_id != -1
    GROUP BY amplitude_id, session_id
    HAVING COUNT(event_time) > 1 AND TIMESTAMP_DIFF(MAX(event_time), MIN(event_time), SECOND) > 0 AND TIMESTAMP_DIFF(MAX(event_time),
      MIN(event_time), SECOND) < 14400
  )
SELECT
  event_month,
  ROUND(APPROX_QUANTILES(duration_sec, 100)[OFFSET(50)] / 60, 2) AS median_duration_min,
  ROUND(APPROX_QUANTILES(duration_sec, 100)[OFFSET(90)] / 60, 2) AS top_10_percent_duration_min
FROM
  SessionDurations
GROUP BY event_month
ORDER BY event_month DESC
