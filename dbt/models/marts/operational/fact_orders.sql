-- Grain: заявка (order_id). is_valid відсіює скасовані/відхилені — єдине
-- визначення замість 2 різних написань (`canceled`/`cancelled`) і 2 різних
-- наборів статусів, знайдених в аудиті Looker (Q2/Q6 vs Q8). Перевірено:
-- в поточних даних немає жодного 'cancelled'(2л)/'rejected' рядка (тільки
-- 'canceled'), але лишаємо всі три написання в фільтрі — дешевий захист від
-- дрейфу даних, а не гіпотетична проблема.
--
-- days_to_resolve NULL, якщо заявка ще не завершена — "скільки днів заявка
-- вже відкрита" (беклог) це інша метрика, рахується в mart на CURRENT_DATE().
--
-- ── Групові заявки: батько рахується, діти ні (рішення Максима 2026-08-26) ─
--
-- У CRM групова заявка — це один «батько» (`parent_id IS NULL`) і N «дітей»
-- (`parent_id = батько`). До цієї зміни дашборд рахував КОЖНУ дитину як
-- окрему заявку, а батька не рахував узагалі — жоден запит `parent_id` не
-- використовував. Масштаб: зі 164 885 заявок 10 061 дочірніх, 1 226
-- батьківських, 153 598 одиночних. У січні 2026 дочірні дали 21% усього
-- потоку (2 057 з 9 711) — це і є більша частина того сплеску 9,5 тис. на
-- старому графіку.
--
-- Тепер `is_child` позначає дитину, і всі марти заявок фільтрують
-- `where not is_child`. Батько як представник групи чесний: його статус
-- збігається зі статусом дітей у 99,5% випадків, категорія — у 99,97%, а
-- ТИП у батька заповнений завжди (у дітей NULL у 4 646 з 10 061), тобто
-- перехід на батька ще й покращує покриття розрізу «Тип заявки».
--
-- ⚠️ Гео батька доводиться діставати з дітей. Усі 1 226 батьків мають
-- `space_id IS NULL` і `citizen_id IS NULL` — вони не привʼязані до
-- приміщення, бо групова заявка створюється УК на набір приміщень одразу.
-- Без цього кроку кожен батько мав би complex_id IS NULL і випав би з УСІХ
-- розрізів по ЖК/будинку, а замість −10 тис. заявок ми б отримали −11 тис.
-- Правило успадкування — «домінантний будинок»: той, у якому найбільше
-- дітей, при рівності — менший house_id (детермінованість). 842 з 1 226
-- батьків мають дітей рівно в одному будинку, 1 199 з 1 226 — в одному ЖК,
-- тож для 98% це не наближення, а точна адреса. Для решти видно
-- `n_child_houses` — розмах групи не ховається.
--
-- Дочірні рядки з моделі НЕ видаляються: вони потрібні, щоб порахувати
-- гео батька, і лишаються доступними для будь-якого аналізу, якому цікава
-- саме поштучна робота. Відповідальність за фільтр — на марті.

with orders as (
    select * from {{ ref('stg_dim9000__orders') }}
),

geo as (
    select * from {{ ref('int_space_geo') }}
),

houses as (
    select * from {{ ref('dim_house') }}
),

-- Запасне джерело назви ЖК і прапорця тестового: у частини заявок є ЖК, але
-- немає будинку (приміщення без секції), і назва бралась би з dim_house як
-- NULL. До появи гео батьків це працювало через int_space_geo напряму.
complexes as (
    select * from {{ ref('dim_complex') }}
),

categories as (
    select * from {{ ref('dim_order_category') }}
),

types as (
    select * from {{ ref('dim_order_type') }}
),

order_tags as (
    select
        order_id,
        array_agg(tag_ua order by tag_ua) as tags
    from {{ ref('int_order_tags') }}
    group by order_id
),

-- Скільки дітей у кожного батька (і хто взагалі батько).
group_parents as (
    select
        parent_order_id as order_id,
        count(*)        as n_children
    from orders
    where parent_order_id is not null
    group by parent_order_id
),

-- Гео дітей, згорнуте до комбінації «будинок × тип обʼєкта».
child_geo as (
    select
        o.parent_order_id as order_id,
        g.house_id,
        g.complex_id,
        g.property_kind_ua,
        count(*) as n
    from orders o
    join geo g on g.space_id = o.space_id
    where o.parent_order_id is not null
    group by o.parent_order_id, g.house_id, g.complex_id, g.property_kind_ua
),

-- Домінантний будинок групи + розмах групи поруч, щоб наближення було видно.
parent_geo as (
    select
        cg.order_id,
        cg.house_id,
        cg.complex_id,
        cg.property_kind_ua,
        s.n_child_houses,
        s.n_child_complexes
    from child_geo cg
    join (
        select
            order_id,
            count(distinct house_id)   as n_child_houses,
            count(distinct complex_id) as n_child_complexes
        from child_geo
        group by order_id
    ) s using (order_id)
    qualify row_number() over (
        partition by cg.order_id order by cg.n desc, cg.house_id
    ) = 1
),

resolved as (
    select
        o.*,
        gp.n_children is not null                     as is_group_parent,
        coalesce(gp.n_children, 0)                    as n_children,
        coalesce(pg.n_child_houses, 0)                as n_child_houses,
        coalesce(pg.n_child_complexes, 0)             as n_child_complexes,
        coalesce(g.house_id,   pg.house_id)           as house_id,
        coalesce(g.complex_id, pg.complex_id)         as complex_id,
        coalesce(g.property_kind_ua, pg.property_kind_ua) as property_kind_ua
    from orders o
    left join geo          g  on g.space_id  = o.space_id
    left join group_parents gp on gp.order_id = o.order_id
    left join parent_geo    pg on pg.order_id = o.order_id
)

select
    r.order_id,
    r.space_id,
    r.house_id,
    r.complex_id,
    coalesce(h.complex_name, cx.complex_name)   as complex_name,
    h.house_number,
    h.house_address,
    h.is_deactivated,
    coalesce(h.is_test_complex, cx.is_test_complex) as is_test_complex,
    -- Тип об'єкта (Квартира/Паркінг/Комерційне/Комора) — розріз, який
    -- операційний дашборд робить на "Відхилених заявках" і в шукачі аномалій.
    coalesce(r.property_kind_ua, 'Невідомо')     as property_kind_ua,

    -- Групові заявки. is_child — той самий фільтр для всіх мартів заявок.
    r.parent_order_id,
    r.parent_order_id is not null                as is_child,
    r.is_group_parent,
    r.n_children,
    r.n_child_houses,
    r.n_child_complexes,

    r.category                                   as category_key,
    coalesce(c.category_ua, r.category, 'Інше')  as category_ua,
    r.type                                        as type_key,
    coalesce(t.type_ua, 'Не вказано')             as type_ua,

    -- Теги CRM (сторінка «Заявки»). Порожній масив, а не NULL — щоб
    -- `array_length(tags) = 0` читалось як «тега немає» без coalesce на
    -- кожному використанні.
    coalesce(tg.tags, [])                         as tags,
    array_length(coalesce(tg.tags, []))           as n_tags,

    r.status,
    r.status not in ('canceled', 'cancelled', 'rejected') as is_valid,
    r.completed_at is not null                    as is_resolved,
    r.citizen_id,
    r.created_at,
    r.updated_at,
    r.completed_at,
    -- Дата ЗАКРИТТЯ заявки (виконано або скасовано). completed_at за фактом
    -- працює як closed_at — він проставлений і на 94% скасованих теж.
    -- Fallback на updated_at потрібен через legacy-дані: у 2022-2023 поле
    -- completed_at порожнє у 17-20% закритих заявок (з'явилось/забекфілено
    -- лише з 2024, де пропусків уже 0,1%). Без fallback ряд "виконано" за
    -- 2022-2023 просто провалюється на п'ятину. Історія переходів статусів
    -- тут не рятує — вона покриває лише 1 303 з 8 932 таких заявок.
    -- is_close_date_estimated робить цей компроміс видимим, а не мовчазним.
    case
        when r.status in ('completed', 'canceled', 'cancelled', 'rejected')
        then coalesce(r.completed_at, r.updated_at)
    end                                           as closed_at,
    r.status in ('completed', 'canceled', 'cancelled', 'rejected')
        and r.completed_at is null                as is_close_date_estimated,
    r.deadline,
    r.planned_deadline,
    case
        when r.completed_at is not null
        then date_diff(date(r.completed_at), date(r.created_at), day)
    end as days_to_resolve
from resolved r
left join houses     h  on h.house_id     = r.house_id
left join complexes  cx on cx.complex_id  = r.complex_id
left join categories c  on c.category_key = r.category
left join types      t  on t.type_key     = r.type
left join order_tags tg on tg.order_id    = r.order_id
