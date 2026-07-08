-- Looker Studio custom SQL — product
-- datasource_id: f05a1e35-21ae-41da-8cbd-761b8acef0d2
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 39   first_seen: 2026-04-13   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.users, postgresqldim9000.spaces, postgresqldim9000.master_buh_service, postgresqldim9000.EVENTS_407641, postgresqldim9000.master_buh_service_payment, postgresqldim9000.master_buh_information
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  frontend_events AS (
    SELECT
      JSON_EXTRACT_SCALAR(user_properties, '$.phone_number') AS amplitude_phone,
      event_type,
      event_time
    FROM
      `analytics-454817.postgresqldim9000.EVENTS_407641`
    WHERE
      event_type IN ('active_receipt_btn_payment_view', 'active_receipt_popup_payment_success_view')
  ),
  user_mapping AS (
    SELECT
      id AS user_id,
      CAST(phone AS STRING) AS phone_str
    FROM
      `analytics-454817.postgresqldim9000.users`
  ),
  space_mapping AS (
    SELECT
      id AS space_id,
      owner_id
    FROM
      `analytics-454817.postgresqldim9000.spaces`
  ),
  backend_payments AS (
    SELECT
      info.space_id,
      pay.price_to_pay,
      pay.created_at
    FROM
      `analytics-454817.postgresqldim9000.master_buh_information` AS info
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_service` AS srv
      ON info.id = srv.master_buh_information_id
      JOIN
      `analytics-454817.postgresqldim9000.master_buh_service_payment` AS pay
      ON srv.id = pay.service_id
  ),
  funnel_with_amounts AS (
    SELECT
      fs.amplitude_phone,
      fs.event_type,
      SAFE_CAST(bp.price_to_pay AS FLOAT64) AS amount
    FROM
      frontend_events AS fs
      JOIN
      user_mapping AS um
      ON fs.amplitude_phone = um.phone_str
      JOIN
      space_mapping AS sm
      ON um.user_id = sm.owner_id
      JOIN
      backend_payments AS bp
      ON sm.space_id = bp.space_id AND FORMAT_DATE('%Y%m', DATE(fs.event_time)) = FORMAT_DATE('%Y%m', DATE(bp.created_at))
  )
SELECT
  CASE
    WHEN amount <= 500 THEN '1. До 500 грн'
    WHEN amount > 500 AND amount <= 1500 THEN '2. 500 - 1500 грн'
    WHEN amount > 1500 AND amount <= 3000 THEN '3. 1500 - 3000 грн'
    ELSE '4. Более 3000 грн'
  END AS amount_bucket,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'active_receipt_btn_payment_view' THEN amplitude_phone
    END) AS users_saw_button,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'active_receipt_popup_payment_success_view' THEN amplitude_phone
    END) AS users_paid
FROM
  funnel_with_amounts
WHERE
  amount IS NOT NULL
GROUP BY amount_bucket
ORDER BY amount_bucket
