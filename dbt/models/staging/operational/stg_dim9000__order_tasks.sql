-- Задачі по заявках (order_id NOT NULL) або задачі співробітників (order_id
-- IS NULL). Джерело: postgresqldim9000.order_tasks.
-- ⚠️ status тут ІНШИЙ enum, ніж orders.status (closed/canceled/in_progress/
-- assigned/done) — не мапити напряму.

select
    id                      as task_id,
    order_id,
    category,
    status,
    responsible_id,
    assignee_id,
    supplier_id,
    watcher_id,
    author_id,
    created_at,
    updated_at,
    completed_at,
    estimated_complete_date,
    planned_complete_date,
    description
from {{ source('postgresqldim9000_operational', 'order_tasks') }}
