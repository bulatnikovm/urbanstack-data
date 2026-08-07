-- Стр.1 — метрики по всій компанії (без розрізу по ЖК). Джерело для скоркарт
-- і часових рядів.
--
-- З 2026-08-04 сума по ЖК у mart_user_base_monthly ДОРІВНЮЄ цим тоталам
-- (кожен користувач має рівно один основний ЖК). Модель лишається окремою для
-- зручності дашборду і бо тут є діагностика чистки бази.

with base_all as (

    select * from {{ ref('int_user_base_monthly') }}

),

-- ЧИСТА база: тільки активні мешканці. Деактивовані (за роллю) і співробітники
-- УК виключені; мешканці деактивованих будинків уже відсіяні point-in-time
-- фільтром в int_user_base_monthly.
base as (

    select * from base_all where is_active_resident

),

base_agg as (

    select
        report_month,
        count(distinct user_id)                                     as count_potential,
        count(distinct if(is_confirmed, user_id, null))              as count_confirmed
    from base
    group by report_month

),

-- Діагностика: скільки і кого відсіяли, щоб нічого не зникало мовчки.
excluded as (

    select
        report_month,
        count(distinct if(exclusion_reason = 'role_deactivated',  user_id, null)) as excluded_role_deactivated,
        count(distinct if(exclusion_reason = 'house_deactivated', user_id, null)) as excluded_house_deactivated,
        count(distinct if(exclusion_reason = 'employee',          user_id, null)) as excluded_employees,
        count(distinct if(exclusion_reason = 'test_complex',      user_id, null)) as excluded_test_complex,
        count(distinct user_id)                                                   as count_with_space_any_status
    from base_all
    group by report_month

),

activity as (

    select
        a.event_month                                           as report_month,
        a.user_phone_sk,
        a.is_core_active
    from {{ ref('int_user_monthly_activity') }} as a
    where exists (
        select 1 from base as b
        where b.user_phone_sk = a.user_phone_sk
          and b.report_month  = a.event_month
    )

),

activity_agg as (

    select
        report_month,
        count(distinct user_phone_sk)                            as visitors,
        count(distinct if(is_core_active, user_phone_sk, null))  as active_core_mau
    from activity
    group by report_month

),

devices as (

    select
        event_month                                              as report_month,
        count(distinct device_id)                                as visitors_devices
    from {{ ref('int_events_enriched') }}
    where not coalesce(is_technical, false)
    group by event_month

)

select
    b.report_month,
    format_date('%Y-%m', b.report_month)                        as report_month_key,

    b.count_potential,
    b.count_confirmed,
    safe_divide(b.count_confirmed, b.count_potential)           as rate_confirmed,

    -- Діагностика чистки бази.
    e.count_with_space_any_status,
    e.excluded_role_deactivated,
    e.excluded_house_deactivated,
    e.excluded_employees,
    e.excluded_test_complex,


    coalesce(a.visitors, 0)                                     as visitors,
    coalesce(a.active_core_mau, 0)                              as active_core_mau,
    coalesce(d.visitors_devices, 0)                             as visitors_devices,

    -- Наскільки стара метрика (по установках) завищувала нову (по юзерах).
    safe_divide(d.visitors_devices, a.visitors) - 1              as devices_inflation_rate,

    safe_divide(a.visitors, b.count_confirmed)                  as rate_visitors_of_confirmed,
    safe_divide(a.active_core_mau, b.count_confirmed)           as rate_mau_of_confirmed

from base_agg as b
left join activity_agg as a on a.report_month = b.report_month
left join devices as d      on d.report_month = b.report_month
left join excluded as e     on e.report_month = b.report_month
