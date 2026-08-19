-- Гео задачі: task_id → complex/house/section/space. Джерело:
-- postgresqldim9000.tasks_locations.
--
-- Ця таблиця — єдиний спосіб дізнатись, до якого ЖК належить задача
-- СПІВРОБІТНИКА (order_id IS NULL): у такої задачі немає заявки, а отже й
-- немає space_id, через який будувалось гео решти. Перевірено на даних:
-- 55 735 із 55 736 задач співробітників мають тут complex_id (house_id —
-- 32 915, задача рівня ЖК будинку не має, і це нормально).
--
-- grain — task_id: 207 133 рядки, 207 133 унікальних task_id.

select
    task_id,
    id            as location_id,
    complex_id,
    house_id,
    section_id,
    space_id,
    floor,
    created_at,
    updated_at
from {{ source('postgresqldim9000_operational', 'tasks_locations') }}
