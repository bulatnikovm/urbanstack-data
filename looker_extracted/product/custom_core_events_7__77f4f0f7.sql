-- Looker Studio custom SQL — product
-- datasource_id: 77f4f0f7-8612-46b0-b7b3-94b8437abb89
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 46   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  MonthlyCounts AS (
    SELECT
      DATE_TRUNC(DATE(event_time), MONTH) AS event_month,
      COUNT(DISTINCT
        CASE
          WHEN event_type = 'vote_details_active_scrn__view' THEN JSON_VALUE(user_properties, '$.phone_number')
        END) AS unique_users_saw_voting,
      COUNT(DISTINCT
        CASE
          WHEN event_type = 'vote_details_active_btn_vote_tap' THEN JSON_VALUE(user_properties, '$.phone_number')
        END) AS unique_users_voted
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      DATE(event_time) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE) AND
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL AND event_type IN ('vote_details_active_scrn__view',
        'vote_details_active_btn_vote_tap')
    GROUP BY event_month
  )
SELECT
  event_month,
  unique_users_saw_voting,
  unique_users_voted,
  SAFE_DIVIDE(unique_users_saw_voting - LAG(unique_users_saw_voting, 1) OVER (
      ORDER BY event_month), LAG(unique_users_saw_voting, 1) OVER (
      ORDER BY event_month)) AS saw_voting_mom_change,
  SAFE_DIVIDE(unique_users_voted - LAG(unique_users_voted, 1) OVER (
      ORDER BY event_month), LAG(unique_users_voted, 1) OVER (
      ORDER BY event_month)) AS voted_mom_change,
  SAFE_DIVIDE(unique_users_voted, unique_users_saw_voting) AS voting_conversion_rate
FROM
  MonthlyCounts
ORDER BY event_month DESC
