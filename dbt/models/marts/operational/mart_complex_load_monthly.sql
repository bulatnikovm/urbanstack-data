-- Grain: complex_id × report_month. Основа сторінки «Антирейтинг: Скарги та
-- Навантаження». Одна модель закриває і "звернення за типом клієнта +
-- навантаження/задачі", і "навантаження на ЖК" — у старому дашборді це були
-- два окремі запити з двома різними наборами виключень, які через це не
-- сходились між собою.
--
-- Знаменник навантаження (в беклозі й старих запитах — "ор") = кількість
-- ПРИМІЩЕНЬ ЖК. Береться point-in-time з mart_monthly_complex_overview, тобто
-- рухається разом з портфелем: коли будинок деактивували, його приміщення
-- перестають бути знаменником з того ж місяця. У Looker знаменник рахувався
-- статичним CROSS JOIN по поточному стану — і навантаження ЖК, який пішов з
-- УК, ділилось на приміщення, яких компанія вже не обслуговує.
--
-- Типи звернень рахуються ТІЛЬКИ по дійсних заявках (is_valid) — так само, як
-- у старому запиті: скасована заявка не є навантаженням на керуючу компанію.
--
-- backlog_30d — точковий знімок на кінець кожного місяця: заявки, які на той
-- момент були відкриті ≥30 днів. Це не наростаюча сума, а стан черги; поріг
-- 30 днів (не 29) підтверджений Микитою.
--
-- ⚠️ Відхилення від Looker: тут застосовані виключення тестових ЖК і
-- деактивованих будинків. Рядок «Середній показник» на старій сторінці
-- рахувався взагалі без фільтрів і тому був зміщений тестовими та вже
-- покинутими об'єктами.

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
      and complex_id is not null
      -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
      -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
      and not is_child
),

calendar as (
    select * from {{ ref('dim_calendar_month') }}
),

backbone as (
    select c.complex_id, cal.report_month
    from {{ ref('dim_complex') }} c
    cross join calendar cal
    where not c.is_test_complex
      -- ЖК не існує в місяцях до свого початку (dim_complex.first_month):
      -- інакше новий ЖК тягнеться десятками місяців нулів від 2021 року.
      and cal.report_month >= c.first_month
),

-- Задачі, породжені заявкою: скільки задач висить на кожній заявці.
tasks_per_order as (
    select order_id, count(*) as n_tasks
    from {{ ref('fact_order_tasks') }}
    where order_id is not null
    group by order_id
),

by_type as (
    select
        o.complex_id,
        date_trunc(date(o.created_at), month) as report_month,
        count(*)                                          as total_orders,
        countif(o.type_key = 'client_problem')            as problem_count,
        countif(o.type_key = 'client_complaint')          as complaint_count,
        countif(o.type_key = 'client_offer')              as offer_count,
        countif(o.type_key = 'client_question')           as question_count,
        countif(o.type_key = 'client_service')            as service_count,
        countif(o.type_key is null or o.type_key not in (
            'client_problem', 'client_complaint', 'client_offer',
            'client_question', 'client_service'))         as other_type_count,
        sum(coalesce(t.n_tasks, 0))                       as tasks_from_orders,
        sum(case when o.type_key in ('client_problem', 'client_complaint')
                 then coalesce(t.n_tasks, 0) else 0 end)  as problem_complaint_tasks
    from orders o
    left join tasks_per_order t on t.order_id = o.order_id
    where o.is_valid
    group by o.complex_id, report_month
),

-- Задачі співробітника (без заявки). Гео стало доступним лише після того, як
-- fact_order_tasks почав брати його з tasks_locations — раніше complex_id у
-- таких задач був NULL і метрика не рахувалась узагалі.
employee_tasks as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        count(*) as employee_task_count
    from {{ ref('fact_order_tasks') }}
    where is_employee_task
      and complex_id is not null
      and not coalesce(is_test_complex, false)
    group by complex_id, report_month
),

-- Стан черги на кінець місяця: відкрита ≥30 днів.
backlog as (
    select
        o.complex_id,
        cal.report_month,
        count(*) as backlog_30d
    from orders o
    join calendar cal
      on date(o.created_at) <= date_sub(last_day(cal.report_month), interval 30 day)
     and (o.closed_at is null or date(o.closed_at) > last_day(cal.report_month))
    where o.is_valid
    group by o.complex_id, cal.report_month
),

spaces as (
    select
        complex_id,
        report_month,
        n_apartments + n_parking + n_commercial + n_storeroom as n_spaces
    from {{ ref('mart_monthly_complex_overview') }}
)

select
    b.complex_id,
    b.report_month,
    coalesce(sp.n_spaces, 0)                as n_spaces,
    coalesce(t.total_orders, 0)             as total_orders,
    coalesce(t.problem_count, 0)            as problem_count,
    coalesce(t.complaint_count, 0)          as complaint_count,
    coalesce(t.offer_count, 0)              as offer_count,
    coalesce(t.question_count, 0)           as question_count,
    coalesce(t.service_count, 0)            as service_count,
    coalesce(t.other_type_count, 0)         as other_type_count,
    coalesce(t.problem_count, 0) + coalesce(t.complaint_count, 0) as problem_complaint_count,
    coalesce(bl.backlog_30d, 0)             as backlog_30d,
    coalesce(t.tasks_from_orders, 0)        as tasks_from_orders,
    -- Чисельник task_ratio окремою колонкою: без нього показник неможливо
    -- переагрегувати до рівня компанії — середнє з відношень по ЖК дало б
    -- маленькому ЖК таку саму вагу, як великому.
    coalesce(t.problem_complaint_tasks, 0)  as problem_complaint_tasks,
    coalesce(et.employee_task_count, 0)     as employee_task_count,
    coalesce(t.tasks_from_orders, 0) + coalesce(et.employee_task_count, 0) as total_tasks,

    -- Навантаження: скільки проблем і скарг припадає на одне приміщення ЖК.
    safe_divide(coalesce(t.problem_count, 0) + coalesce(t.complaint_count, 0),
                nullif(sp.n_spaces, 0))                          as load_rate,
    -- Те саме, але тільки скарги — окремий показник, бо скарга це вже
    -- claim до УК, а не просто зламаний ліфт.
    safe_divide(t.complaint_count, nullif(sp.n_spaces, 0))       as complaint_load,
    -- Яка частка "гострих" звернень — це саме скарги.
    safe_divide(t.complaint_count,
                nullif(coalesce(t.problem_count, 0) + coalesce(t.complaint_count, 0), 0))
                                                                 as complaint_rate,
    -- Скільки внутрішньої роботи породжує одна проблема/скарга.
    safe_divide(t.problem_complaint_tasks,
                nullif(coalesce(t.problem_count, 0) + coalesce(t.complaint_count, 0), 0))
                                                                 as task_ratio
from backbone b
left join by_type        t  on t.complex_id  = b.complex_id and t.report_month  = b.report_month
left join employee_tasks et on et.complex_id = b.complex_id and et.report_month = b.report_month
left join backlog        bl on bl.complex_id = b.complex_id and bl.report_month = b.report_month
left join spaces         sp on sp.complex_id = b.complex_id and sp.report_month = b.report_month
