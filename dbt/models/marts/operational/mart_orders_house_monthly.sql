-- Grain: complex_id × house_id × property_kind_ua × category_ua × type_ua ×
-- report_month. Найдетальніший зріз заявок, який їде на дашборд.
--
-- Одна модель під три блоки, які в Looker були трьома окремими запитами з
-- трьома різними механізмами виключення будинків:
--   · «Шукач аномалій» — провал від категорії/типу до конкретного будинку;
--   · «Відхилені заявки» в розрізі будинку і типу об'єкта;
--   · антирейтинг будинків (заявки на приміщення) — агрегується звідси вгору.
--
-- Найглибший рівень старого «Шукача» був приміщення, а не будинок. Свідомо
-- зупиняємось на будинку: приміщення дає ~164 тис. комбінацій, які нікуди не
-- вивантажити статично, і головне — рішення операційки приймаються по
-- будинку, а не по конкретній квартирі.
--
-- Деактивація застосована POINT-IN-TIME, як і в решті операційного шару:
-- місяці до деактивації лишаються в історії (заявки тоді були реальні), після
-- — будинок з ряду зникає.

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
      and complex_id is not null
      and house_id is not null
      -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
      -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
      and not is_child
),

houses as (
    select house_id, deactivated_at, n_apartments
    from {{ ref('dim_house') }}
),

created as (
    select
        o.complex_id,
        o.complex_name,
        o.house_id,
        o.house_number,
        o.property_kind_ua,
        o.category_ua,
        o.type_ua,
        date_trunc(date(o.created_at), month) as report_month,
        count(*)            as created_count,
        countif(o.is_valid) as valid_count,
        countif(not o.is_valid) as canceled_count
    from orders o
    group by o.complex_id, o.complex_name, o.house_id, o.house_number,
             o.property_kind_ua, o.category_ua, o.type_ua, report_month
),

completed as (
    select
        o.house_id,
        o.property_kind_ua,
        o.category_ua,
        o.type_ua,
        date_trunc(date(o.closed_at), month) as report_month,
        countif(o.is_valid) as completed_count
    from orders o
    where o.closed_at is not null
    group by o.house_id, o.property_kind_ua, o.category_ua, o.type_ua, report_month
)

select
    cr.complex_id,
    cr.complex_name,
    cr.house_id,
    cr.house_number,
    cr.property_kind_ua,
    cr.category_ua,
    cr.type_ua,
    cr.report_month,
    cr.created_count,
    cr.valid_count,
    cr.canceled_count,
    coalesce(co.completed_count, 0) as completed_count,
    h.n_apartments
from created cr
join houses h on h.house_id = cr.house_id
left join completed co
  on  co.house_id         = cr.house_id
  and co.property_kind_ua = cr.property_kind_ua
  and co.category_ua      = cr.category_ua
  and co.type_ua          = cr.type_ua
  and co.report_month     = cr.report_month
where h.deactivated_at is null or h.deactivated_at >= timestamp(cr.report_month)
