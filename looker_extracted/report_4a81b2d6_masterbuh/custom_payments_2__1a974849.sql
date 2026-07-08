-- Looker Studio custom SQL — report_4a81b2d6_masterbuh
-- datasource_id: 1a974849-7cee-46ad-a4f0-0660a25b4f1a
-- report_id: 4a81b2d6-ad30-40c4-be18-5b659d6e9f0c
-- type: custom
-- runs(90d): 77   first_seen: 2026-04-15   last_seen: 2026-06-17
-- referenced_tables: postgresqldim9000.master_buh_service_payment, postgresqldim9000.master_buh_information, postgresqldim9000.spaces, postgresqldim9000.master_buh_service, postgresqldim9000.locations, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.houses, postgresqldim9000.space_commercials
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  complexes.name AS complex_name,
  p.period,
  srv.name AS service_name,
  master_buh_information.space_id,
  master_buh_information.master_buh_id,
  CASE
    WHEN s.kind = 'commercial' AND sc.type = 'parking' THEN CONCAT(l.street, ', буд. ', h.number, ', паркінг ',
      s.number)
    WHEN s.kind = 'commercial' AND sc.type = 'storeroom' THEN CONCAT(l.street, ', буд. ', h.number, ', комора ',
      s.number)
    WHEN s.kind = 'commercial' THEN CONCAT(l.street, ', буд. ', h.number, ', комерція ', s.number)
    ELSE CONCAT(l.street, ', буд. ', h.number, ', кв. ', s.number)
  END AS address,
  p.synced_at
FROM
  `analytics-454817.postgresqldim9000.master_buh_service_payment` AS p
  LEFT JOIN
  `analytics-454817.postgresqldim9000.master_buh_service` AS srv
  ON p.service_id = srv.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.master_buh_information` AS master_buh_information
  ON srv.master_buh_information_id = master_buh_information.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.spaces` AS s
  ON s.id = master_buh_information.space_id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.space_commercials` AS sc
  ON s.id = sc.id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.sections` AS sec
  ON sec.id = s.section_id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.houses` AS h
  ON h.id = sec.house_id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.locations` AS l
  ON l.id = h.location_id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.complexes` AS complexes
  ON complexes.id = h.complex_id
WHERE
  SAFE.PARSE_DATE('%Y%m', p.period) >= DATE_SUB(`CURRENT_DATE`(), INTERVAL 6 MONTH)
