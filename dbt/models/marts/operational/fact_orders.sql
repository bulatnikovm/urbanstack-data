-- Grain: заявка (order_id). is_valid відсіює скасовані/відхилені — єдине
-- визначення замість 2 різних написань (`canceled`/`cancelled`) і 2 різних
-- наборів статусів, знайдених в аудиті Looker (Q2/Q6 vs Q8). Перевірено:
-- в поточних даних немає жодного 'cancelled'(2л)/'rejected' рядка (тільки
-- 'canceled'), але лишаємо всі три написання в фільтрі — дешевий захист від
-- дрейфу даних, а не гіпотетична проблема.
--
-- days_to_resolve NULL, якщо заявка ще не завершена — "скільки днів заявка
-- вже відкрита" (беклог) це інша метрика, рахується в mart на CURRENT_DATE().

with orders as (
    select * from {{ ref('stg_dim9000__orders') }}
),

geo as (
    select * from {{ ref('int_space_geo') }}
),

houses as (
    select * from {{ ref('dim_house') }}
),

categories as (
    select * from {{ ref('dim_order_category') }}
),

types as (
    select * from {{ ref('dim_order_type') }}
)

select
    o.order_id,
    o.space_id,
    g.house_id,
    g.complex_id,
    g.complex_name,
    h.house_number,
    h.is_deactivated,
    h.is_test_complex,
    o.category                                   as category_key,
    coalesce(c.category_ua, o.category, 'Інше')  as category_ua,
    o.type                                        as type_key,
    coalesce(t.type_ua, 'Не вказано')             as type_ua,
    o.status,
    o.status not in ('canceled', 'cancelled', 'rejected') as is_valid,
    o.completed_at is not null                    as is_resolved,
    o.citizen_id,
    o.created_at,
    o.updated_at,
    o.completed_at,
    o.deadline,
    o.planned_deadline,
    case
        when o.completed_at is not null
        then date_diff(date(o.completed_at), date(o.created_at), day)
    end as days_to_resolve
from orders o
left join geo       g on g.space_id = o.space_id
left join houses    h on h.house_id = g.house_id
left join categories c on c.category_key = o.category
left join types      t on t.type_key = o.type
