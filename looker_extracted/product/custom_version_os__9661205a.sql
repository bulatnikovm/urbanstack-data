-- Looker Studio custom SQL — product
-- datasource_id: 9661205a-7381-43d9-a6fe-be5cad9895a6
-- report_id: c2180c98-0cf4-49af-a1d0-0ad3364cb599
-- type: custom
-- runs(90d): 288   first_seen: 2026-04-09   last_seen: 2026-07-08
-- referenced_tables: postgresqldim9000.EVENTS_407641
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

SELECT
  version_name,
  CASE
    WHEN LOWER(platform) LIKE '%ios%' THEN 'iOS'
    WHEN LOWER(platform) LIKE '%android%' THEN 'Android'
    ELSE 'Other'
  END AS os_type,
  COUNT(DISTINCT JSON_VALUE(user_properties, '$.phone_number')) AS active_users
FROM
  `analytics-454817.postgresqldim9000.EVENTS_407641`
WHERE
  DATE(event_time) >= SAFE.PARSE_DATE('%Y%m%d', @DS_START_DATE) AND DATE(event_time) <= SAFE.PARSE_DATE('%Y%m%d',
    @DS_END_DATE) AND event_type = 'news_scrn__view' AND version_name IS NOT NULL
GROUP BY version_name, os_type
ORDER BY SAFE_CAST(SPLIT(version_name, '.')[SAFE_OFFSET(0)] AS INT64) DESC, SAFE_CAST(SPLIT(version_name,
  '.')[SAFE_OFFSET(1)] AS INT64) DESC, SAFE_CAST(SPLIT(version_name, '.')[SAFE_OFFSET(2)] AS INT64) DESC
