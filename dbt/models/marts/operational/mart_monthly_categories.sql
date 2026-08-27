-- Grain: complex_id × report_month × category_ua × type_ua.
-- Основа сторінки «Аналітика звернень: Типи та Категорії».
--
-- Лічильники ті самі, що в mart_monthly_sla, і рахуються тим самим способом:
-- створено — по created_at, виконано/скасовано — по closed_at. Тому суми по
-- всіх категоріях і типах у межах ЖК × місяця ЗБІГАЮТЬСЯ з mart_monthly_sla
-- рядок-у-рядок; це навмисно, щоб цифра на сторінці SLA і цифра на сторінці
-- звернень не розходились через різну методику.
--
-- Backlog тут свідомо НЕ рахується: наростаючий залишок на грануляції
-- ЖК×категорія×тип вимагає повного спайна на всіх комбінаціях і дає ряд, у
-- якому окрема сходинка нічого не означає. Залишок живе на рівні ЖК
-- (mart_monthly_sla.backlog_end_of_month), прострочка 30+ — на рівні будинку
-- (mart_house_rating) і ЖК (mart_complex_load_monthly).
--
-- Попередня версія моделі віддавала єдине поле order_count з is_valid у
-- грануляції — з нього не можна було дістати ні "виконано", ні швидкість
-- закриття в розрізі категорії.
--
-- created_count і valid_created_count лежать поруч навмисно. Сторінка SLA
-- питає "скільки подали" (усе, разом зі скасованим потім), сторінка звернень
-- питає "скільки роботи прийшло" (без скасованого) — і в старому дашборді ці
-- два питання відповідались одним полем у різних запитах, через що розподіл
-- по типах не сходився з лічильниками навантаження на тій самій сторінці.
-- valid_created_count фільтрує по СТАТУСУ заявки, а не по місяцю скасування:
-- canceled_count датований місяцем закриття, тому created − canceled ≠
-- "подали і не скасували".

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
      and complex_id is not null
      -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
      -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
      and not is_child
),

created as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        category_ua,
        type_ua,
        count(*) as created_count,
        countif(is_valid) as valid_created_count
    from orders
    group by complex_id, report_month, category_ua, type_ua
),

closed as (
    select
        complex_id,
        date_trunc(date(closed_at), month) as report_month,
        category_ua,
        type_ua,
        countif(is_valid) as completed_count,
        countif(not is_valid) as canceled_count,
        countif(is_valid and date_trunc(date(created_at), month) = date_trunc(date(closed_at), month))
            as completed_same_month_count
    from orders
    where closed_at is not null
    group by complex_id, report_month, category_ua, type_ua
)

select
    coalesce(cr.complex_id, cl.complex_id)     as complex_id,
    coalesce(cr.report_month, cl.report_month) as report_month,
    coalesce(cr.category_ua, cl.category_ua)   as category_ua,
    coalesce(cr.type_ua, cl.type_ua)           as type_ua,
    coalesce(cr.created_count, 0)              as created_count,
    coalesce(cr.valid_created_count, 0)        as valid_created_count,
    coalesce(cl.completed_count, 0)            as completed_count,
    coalesce(cl.canceled_count, 0)             as canceled_count,
    coalesce(cl.completed_same_month_count, 0) as completed_same_month_count
from created cr
full outer join closed cl
  on  cl.complex_id   = cr.complex_id
  and cl.report_month = cr.report_month
  and cl.category_ua  = cr.category_ua
  and cl.type_ua      = cr.type_ua
