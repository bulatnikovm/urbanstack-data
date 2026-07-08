-- Looker Studio custom SQL — product
-- datasource_id: ad928bbd-6095-4630-9d0d-413673fa3cbc
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 120   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  SessionDurations AS (
    SELECT
      session_id,
      DATE_TRUNC(DATE(MIN(event_time)), MONTH) AS event_month,
      TIMESTAMP_DIFF(MAX(event_time), MIN(event_time), SECOND) AS session_duration_sec
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      session_id IS NOT NULL AND DATE(event_time) >= SAFE.PARSE_DATE('%Y%m%d', @DS_START_DATE) AND DATE(event_time) <=
      SAFE.PARSE_DATE('%Y%m%d', @DS_END_DATE)
    GROUP BY session_id
    HAVING COUNT(event_time) > 1
  ),
  MonthlyTime AS (
    SELECT
      event_month,
      SUM(session_duration_sec) AS total_month_time_sec,
      COUNT(DISTINCT session_id) AS total_month_sessions
    FROM
      SessionDurations
    GROUP BY event_month
  ),
  TargetEvents AS (
    SELECT
      DATE(event_time) AS event_date,
      DATE_TRUNC(DATE(event_time), MONTH) AS event_month,
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL AND event_type IN ('request_new_desc_btn_success_ok_tap',
        'active_receipt_popup_payment_success_view', 'active_receipt_popup_payment_fail_view', 'vote_details_active_form__tap',
        'paid_service_description_btn_success_ok_tap') AND DATE(event_time) >= SAFE.PARSE_DATE('%Y%m%d', @DS_START_DATE) AND
      DATE(event_time) <= SAFE.PARSE_DATE('%Y%m%d', @DS_END_DATE)
  ),
  DailyKeyActions AS (
    SELECT
      event_date,
      event_month,
      COUNT(DISTINCT phone_number) AS daily_active_users
    FROM
      TargetEvents
    GROUP BY event_date, event_month
  ),
  MonthlyStats_DAU AS (
    SELECT
      event_month,
      AVG(daily_active_users) AS avg_dau_monthly
    FROM
      DailyKeyActions
    GROUP BY event_month
  ),
  MonthlyStats_MAU AS (
    SELECT
      event_month,
      COUNT(DISTINCT phone_number) AS total_monthly_active_users
    FROM
      TargetEvents
    GROUP BY event_month
  ),
  MonthlyUserStats AS (
    SELECT
      DAU.event_month,
      DAU.avg_dau_monthly,
      MAU.total_monthly_active_users
    FROM
      MonthlyStats_DAU AS DAU
      LEFT JOIN
      MonthlyStats_MAU AS MAU
      ON DAU.event_month = MAU.event_month
  )
SELECT
  MU.event_month,
  MU.avg_dau_monthly,
  SAFE_DIVIDE(MU.avg_dau_monthly - LAG(MU.avg_dau_monthly, 1) OVER (
      ORDER BY MU.event_month), LAG(MU.avg_dau_monthly, 1) OVER (
      ORDER BY MU.event_month)) AS avg_dau_mom_change,
  SAFE_DIVIDE(MT.total_month_time_sec, MT.total_month_sessions) / 60 AS avg_time_per_session_min,
  SAFE_DIVIDE((SAFE_DIVIDE(MT.total_month_time_sec, MT.total_month_sessions) / 60) - LAG(SAFE_DIVIDE(MT.total_month_time_sec,
        MT.total_month_sessions) / 60, 1) OVER (
      ORDER BY MU.event_month), LAG(SAFE_DIVIDE(MT.total_month_time_sec, MT.total_month_sessions) / 60, 1) OVER (
      ORDER BY MU.event_month)) AS avg_time_session_mom_change,
  SAFE_DIVIDE(MT.total_month_time_sec, MU.total_monthly_active_users) / 60 AS avg_time_per_user_min,
  SAFE_DIVIDE((SAFE_DIVIDE(MT.total_month_time_sec, MU.total_monthly_active_users) / 60) - LAG(SAFE_DIVIDE(MT.total_month_time_sec,
        MU.total_monthly_active_users) / 60, 1) OVER (
      ORDER BY MU.event_month), LAG(SAFE_DIVIDE(MT.total_month_time_sec, MU.total_monthly_active_users) / 60,
      1) OVER (
      ORDER BY MU.event_month)) AS avg_time_user_mom_change
FROM
  MonthlyUserStats AS MU
  LEFT JOIN
  MonthlyTime AS MT
  ON MU.event_month = MT.event_month
ORDER BY MU.event_month DESC
