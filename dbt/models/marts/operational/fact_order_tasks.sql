-- Grain: task_id. is_employee_task = order_id IS NULL (задача співробітника,
-- не прив'язана до заявки мешканця) — 55 433 з 205 316 (27%).
-- ⚠️ Гео (complex_id/house_id) для employee-задач NOT NULL тільки тоді, коли
-- вдалось прив'язатись через order_id→orders.space_id. Джерело гео для
-- employee-задач без order_id (dashboard_rebuild_plan.md згадував
-- tasks_locations) не знайдено в поточній схемі — лишається NULL, відомий гап.

with tasks as (
    select * from {{ ref('stg_dim9000__order_tasks') }}
),

orders as (
    select order_id, space_id from {{ ref('stg_dim9000__orders') }}
),

geo as (
    select * from {{ ref('int_space_geo') }}
),

categories as (
    select * from {{ ref('dim_order_category') }}
)

select
    t.task_id,
    t.order_id,
    t.order_id is null                            as is_employee_task,
    g.house_id,
    g.complex_id,
    g.complex_name,
    t.category                                    as category_key,
    coalesce(c.category_ua, t.category, 'Інше')   as category_ua,
    t.status,
    t.status in ('closed', 'done')                as is_completed,
    t.status = 'canceled'                         as is_canceled,
    t.responsible_id,
    t.assignee_id,
    t.created_at,
    t.updated_at,
    t.completed_at,
    t.estimated_complete_date,
    t.planned_complete_date
from tasks t
left join orders o on o.order_id = t.order_id
left join geo    g on g.space_id = o.space_id
left join categories c on c.category_key = t.category
