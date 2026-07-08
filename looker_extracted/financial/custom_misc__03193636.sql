-- Looker Studio custom SQL — financial
-- datasource_id: 03193636-5c9c-4ad9-b213-c4c04ad60247
-- report_id: ca96cfac-6fac-475f-b467-42ea4c4eaf6f
-- type: custom
-- runs(90d): 58   first_seen: 2026-05-07   last_seen: 2026-07-03
-- referenced_tables: postgresqldim9000.complexes, postgresqldim9000.sections, postgresqldim9000.spaces, postgresqldim9000.space_commercials, postgresqldim9000.houses, postgresqldim9000.master_buh_information
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  c.name AS complex_name,
  COUNT(DISTINCT sp.id) AS total_commercial_spaces,
  COUNT(DISTINCT mbi.space_id) AS commercial_with_mbi,
  SAFE_DIVIDE(COUNT(DISTINCT mbi.space_id), COUNT(DISTINCT sp.id)) AS coverage_pct
FROM
  `analytics-454817.postgresqldim9000.spaces` AS sp
  JOIN
  `analytics-454817.postgresqldim9000.space_commercials` AS sc
  ON sc.id = sp.id AND sc.type = 'commercial'
  JOIN
  `analytics-454817.postgresqldim9000.sections` AS sec
  ON sec.id = sp.section_id
  JOIN
  `analytics-454817.postgresqldim9000.houses` AS h
  ON h.id = sec.house_id
  JOIN
  `analytics-454817.postgresqldim9000.complexes` AS c
  ON c.id = h.complex_id
  LEFT JOIN
  `analytics-454817.postgresqldim9000.master_buh_information` AS mbi
  ON mbi.space_id = sp.id
GROUP BY c.name
ORDER BY coverage_pct
