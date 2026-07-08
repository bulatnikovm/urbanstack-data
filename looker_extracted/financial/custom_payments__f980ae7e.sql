-- Looker Studio custom SQL — financial
-- datasource_id: f980ae7e-8630-43b0-b565-0eeaf4780dcc
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: custom
-- runs(90d): 18   first_seen: 2026-05-02   last_seen: 2026-05-29
-- referenced_tables: postgresqldim9000.space_commercials, postgresqldim9000.complexes, postgresqldim9000.houses, postgresqldim9000.master_buh_service, postgresqldim9000.space_apartments, postgresqldim9000.sections, postgresqldim9000.master_buh_service_payment, postgresqldim9000.master_buh_information, postgresqldim9000.spaces
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  complex_name,
  SUM(total_charges) AS charges,
  SUM(total_payments) AS payments,
  SUM(natural_spaces_count) AS natural_count,
  SUM(spaces_count) AS total_count,
  SAFE_DIVIDE(SUM(total_payments), SUM(total_charges)) AS rate_total,
  SAFE_DIVIDE(SUM(natural_spaces_count), SUM(spaces_count)) AS rate_natural,
  SAFE_DIVIDE(SUM(payments_from_natural), SUM(total_charges)) AS rate_clean
FROM
  `analytics-454817.finance_dash.mart_payment_rates`
WHERE
  billing_month = (
    SELECT
      MAX(billing_month)
    FROM
      `analytics-454817.finance_dash.mart_payment_rates`
  )
GROUP BY complex_name
ORDER BY rate_natural DESC
