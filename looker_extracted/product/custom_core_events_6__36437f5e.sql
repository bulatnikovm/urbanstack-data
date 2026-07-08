-- Looker Studio custom SQL — product
-- datasource_id: 36437f5e-a175-44c3-bab0-de01fc500bad
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 47   first_seen: 2026-04-10   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  DATE_TRUNC(DATE(event_time), MONTH) AS event_month,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'request_new_desc_btn_create_tap' THEN JSON_VALUE(user_properties, '$.phone_number')
    END) AS created_requests_regular,
  COUNT(DISTINCT
    CASE
      WHEN event_type = 'paid_service_description_btn_order_tap' THEN JSON_VALUE(user_properties, '$.phone_number')
    END) AS created_requests_paid
FROM
  `analytics-454817.postgresqldim9000.EVENTS_407641`
WHERE
  DATE(event_time) BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE) AND
  JSON_VALUE(user_properties, '$.phone_number') IS NOT NULL
GROUP BY event_month
ORDER BY event_month DESC
