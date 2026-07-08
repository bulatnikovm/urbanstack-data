-- Looker Studio custom SQL — operational
-- datasource_id: b85eb016-4a59-4899-87f1-23fc9df5d835
-- report_id: 1a8ae601-9542-4198-be93-8ed41ca39d4f
-- type: custom
-- runs(90d): 150   first_seen: 2026-04-09   last_seen: 2026-07-01
-- referenced_tables: postgresqldim9000.orders, postgresqldim9000.tasks_locations, postgresqldim9000.order_tasks, postgresqldim9000.sections, postgresqldim9000.complexes, postgresqldim9000.spaces, postgresqldim9000.houses
-- provenance: восстановлено из BigQuery job history 2026-07-08 (requestor=looker_studio)
-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале

WITH
  excluded_houses AS (
    SELECT
      id
    FROM
      UNNEST(ARRAY['e898c6d1-227c-462f-aec2-d4f8949f7f6b', 'a72558c9-5f78-4633-a425-b42a79ee3649', '6017b015-6916-41db-9404-dd5b0885434b',
      'ef446c3b-c38f-4fa2-a887-9633fbba4071', '91aa654b-f87c-48fe-b144-2fa8fd9932df', '60b3c00e-fc59-41d3-b6b2-c8deb8f508d2',
      'b7953ed1-cdc6-4a3d-b731-dbfb28c5cc30', '56d86356-cfe1-4382-b3be-d0fe2c0dba3f', '18c381e0-afa9-4b7f-82cd-9d005dca90e1',
      '0c6a2fb0-979a-4ef0-9e5a-5ef0463e3e21']) AS id
  ),
  geo_registry AS (
    SELECT
      c.id AS complex_id,
      c.name AS complex_name,
      h.id AS house_id,
      s.id AS space_id,
      CAST(s.created_at AS DATE) AS space_created_date
    FROM
      `analytics-454817.postgresqldim9000.spaces` AS s
      LEFT JOIN
      `analytics-454817.postgresqldim9000.sections` AS sec
      ON s.section_id = sec.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON sec.house_id = h.id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON h.complex_id = c.id
  ),
  task_stats AS (
    SELECT
      order_id,
      COUNT(*) AS cnt
    FROM
      `analytics-454817.postgresqldim9000.order_tasks`
    WHERE
      order_id IS NOT NULL
    GROUP BY 1
  ),
  monthly_metrics AS (
    SELECT
      COALESCE(gr.complex_id, 'unknown_complex') AS complex_id,
      COALESCE(gr.complex_name, 'Без ЖК (або сироти)') AS complex_name,
      DATE_TRUNC(DATE(o.created_at), MONTH) AS report_month,
      COUNT(DISTINCT o.id) AS total_orders_all,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) = 'client_problem' THEN o.id
        END) AS problem_cnt,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) = 'client_complaint' THEN o.id
        END) AS complaint_cnt,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) = 'client_offer' THEN o.id
        END) AS offer_cnt,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) = 'client_question' THEN o.id
        END) AS question_cnt,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) = 'client_service' THEN o.id
        END) AS service_cnt,
      COUNT(DISTINCT
        CASE
          WHEN LOWER(o.type) NOT IN ('client_problem', 'client_complaint', 'client_offer', 'client_question', 'client_service') THEN o.id
        END) AS other_type_cnt,
      SUM(COALESCE(ts.cnt, 0)) AS tasks_from_orders,
      SUM(
        CASE
          WHEN LOWER(o.type) IN ('client_problem', 'client_complaint') THEN COALESCE(ts.cnt, 0)
          ELSE 0
        END) AS problem_complaint_tasks
    FROM
      `analytics-454817.postgresqldim9000.orders` AS o
      LEFT JOIN
      geo_registry AS gr
      ON o.space_id = gr.space_id
      LEFT JOIN
      task_stats AS ts
      ON o.id = ts.order_id
    WHERE
      (gr.house_id IS NULL OR gr.house_id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      )) AND LOWER(COALESCE(o.status, '')) NOT IN ('canceled', 'cancelled', 'rejected')
    GROUP BY 1, 2, 3
  ),
  internal_tasks AS (
    SELECT
      DATE_TRUNC(DATE(ot.created_at), MONTH) AS report_month,
      COALESCE(tl.complex_id, h.complex_id) AS complex_id,
      c.name AS complex_name,
      COUNT(DISTINCT ot.id) AS internal_task_cnt
    FROM
      `analytics-454817.postgresqldim9000.order_tasks` AS ot
      JOIN
      `analytics-454817.postgresqldim9000.tasks_locations` AS tl
      ON ot.id = tl.task_id
      LEFT JOIN
      `analytics-454817.postgresqldim9000.houses` AS h
      ON tl.house_id = h.id
      JOIN
      `analytics-454817.postgresqldim9000.complexes` AS c
      ON COALESCE(tl.complex_id, h.complex_id) = c.id
    WHERE
      ot.order_id IS NULL AND (tl.house_id IS NULL OR tl.house_id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      ))
    GROUP BY 1, 2, 3
  ),
  or_metric AS (
    SELECT
      DATE_TRUNC(cal_date, MONTH) AS report_month,
      gr.complex_id,
      COUNT(DISTINCT gr.space_id) AS or_cnt
    FROM
      UNNEST(GENERATE_DATE_ARRAY('2024-01-01', `CURRENT_DATE`(), INTERVAL 1 MONTH)) AS cal_date
      CROSS JOIN
      (
        SELECT DISTINCT
          complex_id,
          space_id,
          space_created_date,
          house_id
        FROM
          geo_registry
      ) AS gr
    WHERE
      gr.space_created_date <= LAST_DAY(cal_date) AND (gr.house_id IS NULL OR gr.house_id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      ))
    GROUP BY 1, 2
  ),
  backlog_snapshots AS (
    SELECT
      DATE_TRUNC(cal_date, MONTH) AS report_month,
      COALESCE(gr.complex_id, 'unknown_complex') AS complex_id,
      COUNT(DISTINCT
        CASE
          WHEN DATE_DIFF(LAST_DAY(cal_date), DATE(o.created_at), DAY) >= 30 THEN o.id
        END) AS backlog_30,
      COUNT(DISTINCT
        CASE
          WHEN DATE_DIFF(LAST_DAY(cal_date), DATE(o.created_at), DAY) >= 29 THEN o.id
        END) AS backlog_29
    FROM
      UNNEST(GENERATE_DATE_ARRAY('2024-01-01', `CURRENT_DATE`(), INTERVAL 1 MONTH)) AS cal_date
      CROSS JOIN
      `analytics-454817.postgresqldim9000.orders` AS o
      LEFT JOIN
      geo_registry AS gr
      ON o.space_id = gr.space_id
    WHERE
      DATE(o.created_at) <= LAST_DAY(cal_date) AND (gr.house_id IS NULL OR gr.house_id NOT IN (
        SELECT
          id
        FROM
          excluded_houses
      )) AND (LOWER(COALESCE(o.status, '')) NOT IN ('completed', 'canceled', 'cancelled', 'rejected') OR DATE(COALESCE(o.completed_at,
          o.updated_at)) > LAST_DAY(cal_date))
    GROUP BY 1, 2
  )
SELECT
  COALESCE(mm.complex_name, it.complex_name) AS complex_name,
  COALESCE(mm.report_month, it.report_month) AS report_month,
  COALESCE(orm.or_cnt, 0) AS OR_cnt,
  COALESCE(mm.total_orders_all, 0) AS total_orders,
  COALESCE(mm.problem_cnt, 0) AS problem_cnt,
  COALESCE(mm.complaint_cnt, 0) AS complaint_cnt,
  COALESCE(mm.offer_cnt, 0) AS offer_cnt,
  COALESCE(mm.question_cnt, 0) AS question_cnt,
  COALESCE(mm.service_cnt, 0) AS service_cnt,
  COALESCE(mm.other_type_cnt, 0) AS other_type_cnt,
  COALESCE(bs.backlog_30, 0) AS backlog_30,
  COALESCE(bs.backlog_29, 0) AS overdue_29_days,
  COALESCE(bs.backlog_30, 0) AS overdue_30_days,
  (COALESCE(mm.problem_cnt, 0) + COALESCE(mm.complaint_cnt, 0)) AS problem_complaint,
  SAFE_DIVIDE(COALESCE(mm.problem_cnt, 0) + COALESCE(mm.complaint_cnt, 0), NULLIF(orm.or_cnt, 0)) AS load_rate,
  SAFE_DIVIDE(mm.complaint_cnt, NULLIF(COALESCE(mm.problem_cnt, 0) + COALESCE(mm.complaint_cnt, 0), 0)) AS complaint_rate,
  SAFE_DIVIDE(mm.complaint_cnt, NULLIF(orm.or_cnt, 0)) AS complaint_load,
  COALESCE(it.internal_task_cnt, 0) AS employee_task,
  (COALESCE(mm.tasks_from_orders, 0) + COALESCE(it.internal_task_cnt, 0)) AS total_tasks,
  SAFE_DIVIDE(mm.problem_complaint_tasks, NULLIF(COALESCE(mm.problem_cnt, 0) + COALESCE(mm.complaint_cnt,
        0), 0)) AS task_ratio
FROM
  monthly_metrics AS mm
  FULL JOIN
  internal_tasks AS it
  ON mm.complex_id = it.complex_id AND mm.report_month = it.report_month
  LEFT JOIN
  or_metric AS orm
  ON COALESCE(mm.complex_id, it.complex_id) = orm.complex_id AND COALESCE(mm.report_month, it.report_month) =
    orm.report_month
  LEFT JOIN
  backlog_snapshots AS bs
  ON COALESCE(mm.complex_id, it.complex_id) = bs.complex_id AND COALESCE(mm.report_month, it.report_month) =
    bs.report_month
ORDER BY report_month DESC, complex_name
