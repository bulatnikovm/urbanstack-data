-- Looker Studio custom SQL — report_4a81b2d6_masterbuh
-- datasource_id: 874c2603-1cb6-4323-ba8a-b00626022aa9
-- report_id: 4a81b2d6-ad30-40c4-be18-5b659d6e9f0c
-- type: custom
-- runs(90d): 88   first_seen: 2026-04-15   last_seen: 2026-06-17
-- referenced_tables: postgresqldim9000.master_buh_service_payment, postgresqldim9000.complexes, postgresqldim9000.sections, postgresqldim9000.master_buh_service, postgresqldim9000.houses, postgresqldim9000.master_buh_information, postgresqldim9000.spaces
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  c.name AS complex_name,
  p.period,
  srv.name AS service_name,
  COUNT(p.id) AS payments_count
FROM
  `analytics-454817.postgresqldim9000.master_buh_service_payment` AS p
  LEFT JOIN
  `analytics-454817.postgresqldim9000.master_buh_service` AS srv
  ON p.service_id = srv.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.master_buh_information` AS info
  ON srv.master_buh_information_id = info.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.spaces` AS s
  ON info.space_id = s.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.sections` AS sec
  ON s.section_id = sec.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.houses` AS h
  ON sec.house_id = h.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.complexes` AS c
  ON h.complex_id = c.id
WHERE
  SAFE.PARSE_DATE('%Y%m', p.period) >= DATE_SUB(`CURRENT_DATE`(), INTERVAL 6 MONTH)
GROUP BY complex_name, p.period, service_name
