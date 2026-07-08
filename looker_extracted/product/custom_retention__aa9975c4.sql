-- Looker Studio custom SQL — product
-- datasource_id: aa9975c4-2bba-4640-995c-a942095137b9
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 288   first_seen: 2026-04-09   last_seen: 2026-06-01
-- referenced_tables: postgresqldim9000.statistic_citizen, postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  PotentialData AS (
    SELECT
      event_month,
      SUM(total) AS total_potential
    FROM
      (
        SELECT
          complex_id,
          total,
          DATE(CAST(year AS INT64), CAST(month AS INT64), 1) AS event_month
        FROM
          `analytics-454817.postgresqldim9000.statistic_citizen`
        WHERE
          DATE(CAST(year AS INT64), CAST(month AS INT64), 1) < DATE_TRUNC(`CURRENT_DATE`(), MONTH)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY complex_id, year, month
          ORDER BY updated_at DESC) = 1
        UNION ALL
        SELECT
          complex_id,
          total,
          DATE_TRUNC(`CURRENT_DATE`(), MONTH) AS event_month
        FROM
          `analytics-454817.postgresqldim9000.statistic_citizen`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY complex_id
          ORDER BY updated_at DESC) = 1
      )
    GROUP BY event_month
  ),
  UserCohorts AS (
    SELECT
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      MIN(DATE_TRUNC(DATE(event_time), MONTH)) AS cohort_month
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
    GROUP BY phone_number
  ),
  NewUsersPerMonth AS (
    SELECT
      cohort_month,
      COUNT(phone_number) AS new_users_count
    FROM
      UserCohorts
    GROUP BY cohort_month
  ),
  CumulativeConfirmed AS (
    SELECT
      cohort_month AS event_month,
      SUM(new_users_count) OVER (
        ORDER BY cohort_month) AS total_confirmed_cumulative
    FROM
      NewUsersPerMonth
  ),
  VisitorsData AS (
    SELECT
      DATE_TRUNC(DATE(event_time), MONTH) AS event_month,
      COUNT(DISTINCT JSON_VALUE(user_properties, '$.phone_number')) AS monthly_active_users
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      event_type = 'news_scrn__view' AND JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
    GROUP BY event_month
  )
SELECT
  COALESCE(P.event_month, C.event_month, V.event_month) AS event_month,
  COALESCE(P.total_potential, 0) AS count_potential,
  COALESCE(C.total_confirmed_cumulative, 0) AS count_confirmed,
  COALESCE(V.monthly_active_users, 0) AS count_visitors,
  SAFE_DIVIDE(C.total_confirmed_cumulative, P.total_potential) AS rate_penetration,
  SAFE_DIVIDE(V.monthly_active_users, C.total_confirmed_cumulative) AS rate_engagement
FROM
  PotentialData AS P
  FULL JOIN
  CumulativeConfirmed AS C
  ON P.event_month = C.event_month
  FULL JOIN
  VisitorsData AS V
  ON P.event_month = V.event_month
WHERE
  COALESCE(P.event_month, C.event_month, V.event_month) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND
  PARSE_DATE('%Y%m%d', @DS_END_DATE)
ORDER BY event_month DESC
