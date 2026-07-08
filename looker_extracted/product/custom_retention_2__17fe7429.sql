-- Looker Studio custom SQL — product
-- datasource_id: 17fe7429-9a2a-4c31-84f9-a592a5cf3479
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 250   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  UserFirstSeen AS (
    SELECT
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      MIN(DATE_TRUNC(DATE(event_time), MONTH)) AS cohort_month
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
    GROUP BY phone_number
  ),
  UserActivity AS (
    SELECT
      u.phone_number,
      u.cohort_month,
      MAX(
        CASE
          WHEN t.event_type IN ('request_new_desc_btn_success_ok_tap', 'active_receipt_popup_payment_success_view',
            'vote_details_active_btn_vote_tap', 'paid_service_description_btn_success_ok_tap') THEN 1
          ELSE 0
        END) AS is_active_activated
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641` AS t
      JOIN
      UserFirstSeen AS u
      ON JSON_VALUE(t.user_properties, '$.phone_number') = u.phone_number
    WHERE
      DATE_TRUNC(DATE(t.event_time), MONTH) = u.cohort_month
    GROUP BY u.phone_number, u.cohort_month
  )
SELECT
  cohort_month AS event_month,
  COUNT(phone_number) AS count_new_users,
  SUM(is_active_activated) AS count_active_activation,
  COUNT(phone_number) - SUM(is_active_activated) AS count_passive_activation
FROM
  UserActivity
WHERE
  cohort_month BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE)
GROUP BY event_month
ORDER BY event_month DESC
