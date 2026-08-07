-- Стр.3 — Активність. Грануляція: report_month.
-- Середній денний актив, медіанний час сесії, медіанний час користувача за
-- місяць, воронка голосувань, створені заявки.
--
-- ⚠️ Сесії беруться з int_user_sessions — єдиного визначення (session_id не
-- -1, >1 події, 0 < тривалість < 4 год). У Looker співіснували ТРИ різні
-- визначення, і "середній денний актив" рахувався без відсіву аномальних
-- сесій. Цифра трохи зміниться.
--
-- ⚠️ "Кількість створених заявок" — це подія застосунку
-- (request_new_desc_btn_create_tap), а НЕ рядок у таблиці orders. Це "намір у
-- додатку", інша метрика, ніж operational fact_orders. Назви полів
-- (`app_requests_*`) навмисно містять `app_`, щоб їх не сплутали.

with daily_core as (

    select
        event_date,
        event_month,
        count(distinct user_phone_sk)   as daily_core_users
    from {{ ref('int_events_enriched') }}
    where is_core_event
      and user_phone_sk is not null
    group by event_date, event_month

),

dau as (

    select
        event_month,
        avg(daily_core_users)           as avg_daily_core_users
    from daily_core
    group by event_month

),

sessions as (

    select
        session_month                                                       as event_month,
        count(*)                                                            as n_sessions,
        approx_quantiles(duration_sec, 100)[offset(50)] / 60.0              as median_session_min,
        approx_quantiles(duration_sec, 100)[offset(90)] / 60.0              as p90_session_min
    from {{ ref('int_user_sessions') }}
    group by session_month

),

user_time as (

    select
        event_month,
        approx_quantiles(total_session_sec, 100)[offset(50)] / 60.0         as median_user_time_min,
        approx_quantiles(total_session_sec, 100)[offset(90)] / 60.0         as p90_user_time_min,
        avg(total_session_sec) / 60.0                                       as avg_user_time_min
    from {{ ref('int_user_monthly_activity') }}
    where total_session_sec > 0
    group by event_month

),

funnels as (

    select
        event_month,
        count(distinct if(event_type = 'vote_details_active_scrn__view',    user_phone_sk, null)) as voting_saw_users,
        count(distinct if(event_type = 'vote_details_active_btn_vote_tap',  user_phone_sk, null)) as voting_voted_users,
        count(distinct if(event_type = 'request_new_desc_btn_create_tap',   user_phone_sk, null)) as app_requests_created_users,
        count(distinct if(event_type = 'paid_service_description_btn_order_tap', user_phone_sk, null)) as app_paid_requests_created_users
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
    group by event_month

)

select
    coalesce(d.event_month, s.event_month, f.event_month)               as report_month,
    format_date('%Y-%m', coalesce(d.event_month, s.event_month, f.event_month)) as report_month_key,

    round(d.avg_daily_core_users, 2)                                    as avg_daily_core_users,
    s.n_sessions,
    round(s.median_session_min, 2)                                      as median_session_min,
    round(s.p90_session_min, 2)                                         as p90_session_min,
    round(u.median_user_time_min, 2)                                    as median_user_time_min,
    round(u.p90_user_time_min, 2)                                       as p90_user_time_min,
    round(u.avg_user_time_min, 2)                                       as avg_user_time_min,

    f.voting_saw_users,
    f.voting_voted_users,
    safe_divide(f.voting_voted_users, f.voting_saw_users)               as voting_conversion_rate,
    f.app_requests_created_users,
    f.app_paid_requests_created_users

from dau as d
full join sessions as s   on s.event_month = d.event_month
full join funnels as f    on f.event_month = coalesce(d.event_month, s.event_month)
left join user_time as u  on u.event_month = coalesce(d.event_month, s.event_month, f.event_month)
