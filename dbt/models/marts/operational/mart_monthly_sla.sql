-- Grain: complex_id × report_month. Основа сторінки «Операційна ефективність».
--
-- Три події заявки розкладені по РІЗНИХ місяцях: створення — по created_at,
-- виконання і скасування — по closed_at (місяць, коли заявку закрили). Саме
-- тому "виконано" за місяць може бути більше, ніж "створено": закривали те,
-- що накопичилось раніше. Це не помилка, а причина, чому поруч живуть два
-- показники — sla_rate (закрито цього місяця / створено цього місяця) і
-- sla_rate_same_month (закрито того ж місяця, коли й створено / створено).
-- Другий ніколи не перевищує 100% і чесно відповідає на питання "скільки
-- встигаємо закрити по гарячому".
--
-- backlog_end_of_month — накопичений незакритий залишок: наростаюча сума
-- (створено − виконано − скасовано) від початку календаря. Рахується на
-- повному спайні complex × month, а не на місяцях з активністю: інакше
-- місяць без жодної заявки просто випадав би з ряду і сходинка накопичення
-- зникала.
--
-- ⚠️ Відхилення від старого дашборду Looker: тут виключені тестові ЖК
-- (is_test_complex). У Looker-запиті на цю сторінку фільтра не було.

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
      and complex_id is not null
      -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
      -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
      and not is_child
),

backbone as (
    select c.complex_id, cal.report_month
    from {{ ref('dim_complex') }} c
    cross join {{ ref('dim_calendar_month') }} cal
    where not c.is_test_complex
      -- ЖК не існує в місяцях до свого початку (dim_complex.first_month):
      -- інакше новий ЖК тягнеться десятками місяців нулів від 2021 року.
      and cal.report_month >= c.first_month
),

created as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        count(*) as created_count
    from orders
    group by complex_id, report_month
),

closed as (
    select
        complex_id,
        date_trunc(date(closed_at), month) as report_month,
        countif(is_valid) as completed_count,
        countif(not is_valid) as canceled_count,
        countif(is_valid and date_trunc(date(created_at), month) = date_trunc(date(closed_at), month))
            as completed_same_month_count,
        countif(not is_valid and date_trunc(date(created_at), month) = date_trunc(date(closed_at), month))
            as canceled_same_month_count,
        countif(is_close_date_estimated) as closed_with_estimated_date
    from orders
    where closed_at is not null
    group by complex_id, report_month
),

joined as (
    select
        b.complex_id,
        b.report_month,
        coalesce(cr.created_count, 0)                as created_count,
        coalesce(cl.completed_count, 0)              as completed_count,
        coalesce(cl.canceled_count, 0)               as canceled_count,
        coalesce(cl.completed_same_month_count, 0)   as completed_same_month_count,
        coalesce(cl.canceled_same_month_count, 0)    as canceled_same_month_count,
        coalesce(cl.closed_with_estimated_date, 0)   as closed_with_estimated_date
    from backbone b
    left join created cr on cr.complex_id = b.complex_id and cr.report_month = b.report_month
    left join closed  cl on cl.complex_id = b.complex_id and cl.report_month = b.report_month
)

select
    complex_id,
    report_month,
    created_count,
    completed_count,
    canceled_count,
    completed_same_month_count,
    canceled_same_month_count,
    closed_with_estimated_date,
    created_count - completed_count - canceled_count as net_change,
    sum(created_count - completed_count - canceled_count) over (
        partition by complex_id order by report_month
        rows between unbounded preceding and current row
    ) as backlog_end_of_month,
    safe_divide(completed_count, nullif(created_count, 0))              as sla_rate,
    safe_divide(completed_same_month_count, nullif(created_count, 0))   as sla_rate_same_month,
    safe_divide(canceled_count, nullif(created_count, 0))               as cancel_rate,
    safe_divide(canceled_same_month_count, nullif(created_count, 0))    as cancel_rate_same_month
from joined
