-- Стр.1 — Поточна база користувачів. Грануляція: report_month × complex_id.
-- Рядок з complex_id = NULL не робимо: тотал рахується сумуванням DISTINCT на
-- рівні дашборду через mart_user_base_totals_monthly (нижче в цьому ж домені).
--
-- Кожен користувач потрапляє РІВНО В ОДИН ЖК (основний — де в нього житло,
-- при рівності найстаріший будинок). Рішення Микити 2026-08-04: «два особові
-- рахунки = один користувач». Тому сума по ЖК тепер дорівнює тоталу з
-- mart_user_base_totals_monthly.
--
-- ⚠️ "Відвідувачі" рахуються ПО КОРИСТУВАЧАХ (телефон), не по amplitude_id
-- (рішення Микити 2026-08-04). amplitude_id — це установка додатку: 20 064
-- девайси на 13 919 телефонів, завищення 22-25%. Для порівняння лишено поле
-- `visitors_devices` — видно масштаб різниці, але на графік іде `visitors`.

with base as (

    -- Тільки активні мешканці: без співробітників УК і без індивідуально
    -- деактивованих (ROLE_INACTIVATED_CITIZEN). Мешканці деактивованих
    -- будинків уже відсіяні point-in-time фільтром в int_user_base_monthly.
    select * from {{ ref('int_user_base_monthly') }}
    where is_active_resident

),

base_agg as (

    select
        report_month,
        complex_id,
        count(distinct user_id)                                     as count_potential,
        count(distinct if(is_confirmed, user_id, null))              as count_confirmed
    from base
    group by report_month, complex_id

),

-- Активність: прив'язуємо користувача до ЖК через базу того ж місяця.
activity as (

    select
        a.event_month                                   as report_month,
        b.complex_id,
        a.user_phone_sk,
        a.is_core_active
    from {{ ref('int_user_monthly_activity') }} as a
    inner join base as b
            on b.user_phone_sk = a.user_phone_sk
           and b.report_month  = a.event_month

),

activity_agg as (

    select
        report_month,
        complex_id,
        count(distinct user_phone_sk)                               as visitors,
        count(distinct if(is_core_active, user_phone_sk, null))     as active_core_mau
    from activity
    group by report_month, complex_id

),

-- Довідково: та сама метрика по установках — щоб було видно масштаб старого
-- завищення. НЕ використовувати як "користувачів".
devices as (

    select
        e.event_month                                   as report_month,
        b.complex_id,
        count(distinct e.device_id)                     as visitors_devices
    from {{ ref('int_events_enriched') }} as e
    inner join base as b
            on b.user_phone_sk = e.user_phone_sk
           and b.report_month  = e.event_month
    where not coalesce(e.is_technical, false)
    group by e.event_month, b.complex_id

),

complexes as (

    select complex_id, complex_name from {{ ref('dim_complex') }}

)

select
    b.report_month,
    format_date('%Y-%m', b.report_month)                as report_month_key,
    b.complex_id,
    c.complex_name,

    b.count_potential,
    b.count_confirmed,
    safe_divide(b.count_confirmed, b.count_potential)   as rate_confirmed,

    coalesce(a.visitors, 0)                             as visitors,
    coalesce(a.active_core_mau, 0)                      as active_core_mau,
    coalesce(d.visitors_devices, 0)                     as visitors_devices,

    safe_divide(a.visitors, b.count_confirmed)          as rate_visitors_of_confirmed,
    safe_divide(a.active_core_mau, b.count_confirmed)   as rate_mau_of_confirmed

from base_agg as b
left join activity_agg as a on a.report_month = b.report_month and a.complex_id = b.complex_id
left join devices as d      on d.report_month = b.report_month and d.complex_id = b.complex_id
left join complexes as c    on c.complex_id   = b.complex_id
