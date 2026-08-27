-- Grain: заявка × тег. Міст між тегом (який у CRM живе на ЗАДАЧІ) і
-- заявкою, яку рахує дашборд.
--
-- Ланцюжок: tags → task_tags_links → order_tasks.order_id → orders.
--
-- ── Дві речі, які легко зламати ───────────────────────────────────────────
--
-- 1. Беремо ЛИШЕ tag_type = 'task'. У тій самій таблиці лежать теги боржника
--    (претензійна робота) і теги мешканця — інші сутності, інші шкали.
--
-- 2. Тег піднімається з ДИТЯЧОЇ заявки на БАТЬКІВСЬКУ. Сьогодні це no-op
--    (жодна дочірня заявка тегів не має: 4 203 одиночні + 76 батьківських і
--    рівно нуль дочірніх), але операційний дашборд рахує лише батьків
--    (fact_orders.is_child), і якщо колись тег повісять на задачу всередині
--    групової заявки — без цього підйому він мовчки зникне з фільтра.
--
-- Покриття низьке й це нормально: теги почали проставляти у 2025-му, за
-- 2026 рік мітку має ~2,3 тис. заявок. Фільтр показує зріз, а не всю базу.

with links as (
    select * from {{ ref('stg_dim9000__task_tags') }}
),

tags as (
    select * from {{ ref('stg_dim9000__tags') }}
    where tag_type = 'task'
),

tasks as (
    select task_id, order_id
    from {{ ref('stg_dim9000__order_tasks') }}
    where order_id is not null
),

orders as (
    select order_id, parent_order_id
    from {{ ref('stg_dim9000__orders') }}
),

tagged as (
    select
        t.order_id,
        g.tag_id,
        g.tag_ua
    from links l
    join tags  g on g.tag_id  = l.tag_id
    join tasks t on t.task_id = l.task_id
),

-- Тег дитини стає тегом батька; тег батька лишається на батьку.
lifted as (
    select
        coalesce(o.parent_order_id, tg.order_id) as order_id,
        tg.tag_id,
        tg.tag_ua
    from tagged tg
    join orders o on o.order_id = tg.order_id
)

select distinct
    order_id,
    tag_id,
    tag_ua
from lifted
