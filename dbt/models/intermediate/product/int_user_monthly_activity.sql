-- Активність користувача за місяць. Грануляція: user_phone_sk × event_month.
-- Бекбон для fct_user_monthly і майже всіх продуктових mart'ів.

with events as (

    select * from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
      and not coalesce(is_technical, false)

),

cohorts as (

    -- Місяць першої появи користувача в подіях = когорта.
    select
        user_phone_sk,
        min(event_month) as cohort_month
    from events
    group by user_phone_sk

),

monthly as (

    select
        e.user_phone_sk,
        e.event_month,
        any_value(e.user_id)                        as user_id,
        any_value(e.complex_id)                     as complex_id,
        max(e.is_confirmed_user)                    as is_confirmed_user,

        count(*)                                    as n_events,
        count(distinct e.event_date)                as n_active_days,

        countif(e.is_core_event)                                    as n_core_events,
        count(distinct if(e.is_core_event, e.event_date, null))     as n_core_days,
        max(e.is_core_event)                                        as is_core_active,
        max(e.is_activation_event)                                  as did_activation_action,
        max(e.is_value_action)                                      as did_value_action,

        -- Остання версія/ОС, що бачив у цьому місяці.
        array_agg(e.app_version ignore nulls order by e.event_time desc limit 1)[safe_offset(0)] as last_app_version,
        array_agg(e.os_type     ignore nulls order by e.event_time desc limit 1)[safe_offset(0)] as last_os_type,

        max(e.event_time)                           as last_event_at

    from events as e
    group by e.user_phone_sk, e.event_month

),

session_time as (

    select
        user_phone_sk,
        session_month                   as event_month,
        count(*)                        as n_sessions,
        sum(duration_sec)               as total_session_sec
    from {{ ref('int_user_sessions') }}
    where user_phone_sk is not null
    group by user_phone_sk, session_month

)

select
    m.user_phone_sk,
    m.event_month,
    m.user_id,
    m.complex_id,
    m.is_confirmed_user,
    c.cohort_month,
    date_diff(m.event_month, c.cohort_month, month)  as months_since_cohort,
    m.event_month = c.cohort_month                   as is_new_user,

    m.n_events,
    m.n_active_days,
    m.n_core_events,
    m.n_core_days,
    m.is_core_active,
    m.did_activation_action,
    m.did_value_action,

    coalesce(s.n_sessions, 0)                        as n_sessions,
    coalesce(s.total_session_sec, 0)                 as total_session_sec,

    m.last_app_version,
    m.last_os_type,
    m.last_event_at

from monthly as m
left join cohorts as c      on c.user_phone_sk = m.user_phone_sk
left join session_time as s on s.user_phone_sk = m.user_phone_sk
                           and s.event_month   = m.event_month
