-- Grain: task_id. is_employee_task = order_id IS NULL (задача співробітника,
-- не прив'язана до заявки мешканця) — 55 736 з 207 146 (27%).
--
-- Гео йде з `tasks_locations` (1:1 по task_id), а вже потім добирається через
-- order_id→orders.space_id. Раніше тут був лише другий шлях, і всі задачі
-- співробітників лишались без complex_id — тобто метрику "внутрішні задачі на
-- ЖК" (і похідний task_ratio) порахувати було нічим. Перевірено: із 55 736
-- задач співробітників complex_id тепер отримують 55 735.
--
-- Пріоритет саме такий: tasks_locations — це те, що операційка проставила
-- задачі явно, а шлях через заявку лише відновлює гео непрямо. Для задач по
-- заявці обидва шляхи збігаються.
-- house_id у tasks_locations заповнений у 89% рядків: задача рівня ЖК
-- (прибирання території, обхід) будинку не має, і це не пропуск даних.

with tasks as (
    select * from {{ ref('stg_dim9000__order_tasks') }}
),

task_geo as (
    select * from {{ ref('stg_dim9000__task_locations') }}
),

orders as (
    select order_id, space_id from {{ ref('stg_dim9000__orders') }}
),

geo as (
    select * from {{ ref('int_space_geo') }}
),

complexes as (
    select * from {{ ref('dim_complex') }}
),

categories as (
    select * from {{ ref('dim_order_category') }}
)

select
    t.task_id,
    t.order_id,
    t.order_id is null                            as is_employee_task,
    coalesce(tg.house_id, g.house_id)             as house_id,
    coalesce(tg.complex_id, g.complex_id)         as complex_id,
    coalesce(c.complex_name, g.complex_name)      as complex_name,
    coalesce(c.is_test_complex, false)            as is_test_complex,
    t.category                                    as category_key,
    coalesce(cat.category_ua, t.category, 'Інше') as category_ua,
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
left join task_geo   tg  on tg.task_id = t.task_id
left join orders     o   on o.order_id = t.order_id
left join geo        g   on g.space_id = o.space_id
left join complexes  c   on c.complex_id = coalesce(tg.complex_id, g.complex_id)
left join categories cat on cat.category_key = t.category
