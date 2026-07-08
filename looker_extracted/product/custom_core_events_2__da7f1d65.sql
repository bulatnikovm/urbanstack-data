-- Looker Studio custom SQL — product
-- datasource_id: da7f1d65-b957-4f05-8448-675f2882fedc
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 162   first_seen: 2026-04-09   last_seen: 2026-06-12
-- referenced_tables: postgresqldim9000.EVENTS_407641, postgresqldim9000.statistic_citizen
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  calendar AS (
    SELECT
      report_month
    FROM
      UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(PARSE_DATE('%Y%m%d', @DS_START_DATE), INTERVAL 1 MONTH), PARSE_DATE('%Y%m%d',
          @DS_END_DATE), INTERVAL 1 MONTH)) AS report_month
  ),
  clean_spaces AS (
    SELECT
      s.id AS space_id,
      h.complex_id,
      s.owner_id
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
    WHERE
      h.complex_id NOT IN ('09c50e9a-7685-435d-ac36-4934aa7fd39c', '585e7b5b-737d-4ad9-bf25-76fdb0af015a',
        'b59820ce-0548-4ade-994d-f617202ad2c5')
  ),
  all_user_mappings AS (
    SELECT
      owner_id AS user_id
    FROM
      clean_spaces
    WHERE
      owner_id IS NOT NULL
    UNION DISTINCT
    SELECT
      su.user_id
    FROM
      `analytics-454817.postgresqldim9000.space_user` AS su
      JOIN
      clean_spaces AS cs
      ON su.space_id = cs.space_id
  ),
  PotentialData AS (
    SELECT
      c.report_month AS event_month,
      COUNT(DISTINCT u.id) AS count_potential
    FROM
      calendar AS c
      CROSS JOIN
      `analytics-454817.postgresqldim9000.users` AS u
      JOIN
      all_user_mappings AS m
      ON u.id = m.user_id
    WHERE
      u.verified = TRUE AND u.role != 'ROLE_INACTIVATED_CITIZEN' AND DATE_TRUNC(DATE(u.created_at), MONTH) <=
      c.report_month
    GROUP BY 1
  ),
  RawEvents AS (
    SELECT
      DATE_TRUNC(DATE(event_time), MONTH) AS event_month,
      JSON_VALUE(user_properties, '$.phone_number') AS phone_number,
      CASE
        WHEN event_type = 'request_new_desc_btn_success_ok_tap' THEN '1. Заявки'
        WHEN event_type = 'active_receipt_popup_payment_success_view' THEN '2. Оплата (Успіх)'
        WHEN event_type = 'active_receipt_popup_payment_fail_view' THEN '2. Оплата (Помилка)'
        WHEN event_type = 'vote_details_active_form__tap' THEN '3. Голосування'
        WHEN event_type = 'paid_service_description_btn_success_ok_tap' THEN '4. Платні заявки'
        WHEN event_type IN ('key_open_btn__click', 'widget_home_key_btn__click', 'widget_control_center_key_btn__click',
          'widget_lock_key_btn__click') THEN '5. СКД'
        WHEN event_type = 'temp_key_create__success' THEN '6. Тимчасові доступи'
      END AS action_category
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      DATE(event_time) BETWEEN DATE_SUB(PARSE_DATE('%Y%m%d', @DS_START_DATE), INTERVAL 1 MONTH) AND PARSE_DATE('%Y%m%d',
        @DS_END_DATE) AND JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
  ),
  CategoryStats AS (
    SELECT
      event_month,
      action_category,
      COUNT(DISTINCT phone_number) AS unique_users
    FROM
      RawEvents
    WHERE
      action_category IS NOT NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT
      event_month,
      '0. Всього активних' AS action_category,
      COUNT(DISTINCT phone_number) AS unique_users
    FROM
      RawEvents
    WHERE
      action_category IS NOT NULL
    GROUP BY 1, 2
  ),
  StatsWithMom AS (
    SELECT
      *,
      SAFE_DIVIDE(unique_users - LAG(unique_users) OVER (PARTITION BY action_category
          ORDER BY event_month), LAG(unique_users) OVER (PARTITION BY action_category
          ORDER BY event_month)) AS mom_change_pct
    FROM
      CategoryStats
  )
SELECT
  S.event_month,
  FORMAT_DATE('%Y-%m', S.event_month) AS year_month,
  S.action_category,
  S.unique_users,
  S.mom_change_pct,
  COALESCE(P.count_potential, 0) AS count_potential,
  SAFE_DIVIDE(S.unique_users, P.count_potential) AS nsm_penetration_rate
FROM
  StatsWithMom AS S
  LEFT JOIN
  PotentialData AS P
  ON S.event_month = P.event_month
WHERE
  S.event_month BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE)
ORDER BY event_month DESC, action_category
