-- Looker Studio custom SQL — product
-- datasource_id: d303fc10-cb14-4a91-bf78-3f526fe9b33c
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 26   first_seen: 2026-04-14   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  User_Timings AS (
    SELECT
      JSON_VALUE(user_properties, '$.phone_number') AS user_id,
      MIN(event_time) AS first_seen,
      MIN(
        CASE
          WHEN event_type IN ('active_receipt_popup_payment_success_view', 'vote_details_active_btn_vote_tap',
            'request_new_desc_btn_success_ok_tap', 'paid_service_description_popup_success_view' 'widget_home_scrn__view' 'widget_home_key_btn__click') THEN event_time
        END) AS first_value_action
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
    GROUP BY 1
  ),
  Median_Calc AS (
    SELECT
      CAST(APPROX_QUANTILES(TIMESTAMP_DIFF(first_value_action, first_seen, MINUTE), 100)[OFFSET(50)] AS INT64) AS m_min
    FROM
      User_Timings
    WHERE
      first_value_action IS NOT NULL AND first_value_action >= first_seen AND TIMESTAMP_DIFF(first_value_action,
        first_seen, DAY) < 30
  )
SELECT
  ROUND(m_min / 60.0, 1) AS median_hours,
  ROUND(m_min / 1440.0, 1) AS median_days,
  CASE
    WHEN m_min >= 1440 THEN FORMAT('%d дн. %d ч.', DIV(m_min, 1440), MOD(DIV(m_min, 60), 24))
    ELSE FORMAT('%d ч. %02d мин.', DIV(m_min, 60), MOD(m_min, 60))
  END AS formatted_time_to_value
FROM
  Median_Calc
