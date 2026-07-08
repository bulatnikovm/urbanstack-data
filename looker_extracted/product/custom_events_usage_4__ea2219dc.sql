-- Looker Studio custom SQL — product
-- datasource_id: ea2219dc-7c83-418b-ae2d-410065b27b9c
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 38   first_seen: 2026-04-13   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'finances_receipts_scrn__view' THEN JSON_EXTRACT_SCALAR(user_properties, '$.phone_number')
    END) AS step_1_list,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'active_receipt_scrn__view' THEN JSON_EXTRACT_SCALAR(user_properties, '$.phone_number')
    END) AS step_2_opened,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'active_receipt_btn_payment_view' THEN JSON_EXTRACT_SCALAR(user_properties, '$.phone_number')
    END) AS step_3_button_seen,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'active_receipt_btn_payment_tap' THEN JSON_EXTRACT_SCALAR(user_properties, '$.phone_number')
    END) AS step_4_button_tap,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'active_receipt_popup_payment_success_view' THEN JSON_EXTRACT_SCALAR(user_properties,
        '$.phone_number')
    END) AS step_5_success
FROM
  `analytics-454817.postgresqldim9000.EVENTS_407641`
WHERE
  event_type IN ('finances_receipts_scrn__view', 'active_receipt_scrn__view', 'active_receipt_btn_payment_view',
    'active_receipt_btn_payment_tap', 'active_receipt_popup_payment_success_view')
