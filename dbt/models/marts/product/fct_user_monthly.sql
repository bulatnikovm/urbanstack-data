-- Бекбон продуктового домену. Грануляція: user_phone_sk × event_month.
-- Один рядок = один користувач у одному місяці, з когортою, активацією,
-- core-активністю, сегментом життєвого циклу і версією застосунку.
--
-- Живить Стр.1 (сегменти), Стр.2 (активація), Стр.3 (актив, версії), Стр.5.

with activity as (

    select * from {{ ref('int_user_monthly_activity') }}

),

-- Чи виконав користувач цільову (термінальну) дію ВЖЕ У МІСЯЦЬ ПРИХОДУ —
-- канонічне визначення "активований" з дашборду (Стр.2).
activation as (

    select
        user_phone_sk,
        max(did_activation_action) as is_activated_in_cohort
    from activity
    where event_month = cohort_month
    group by user_phone_sk

),

-- Останній місяць активності — для сегмента життєвого циклу.
last_seen as (

    select
        user_phone_sk,
        max(event_month)    as last_active_month,
        max(last_event_at)  as last_event_at
    from activity
    group by user_phone_sk

)

select
    a.user_phone_sk,
    a.event_month,
    a.user_id,
    a.complex_id,
    a.cohort_month,
    a.months_since_cohort,
    a.is_new_user,
    coalesce(a.is_confirmed_user, false)                as is_confirmed_user,

    -- Відвідувач = будь-яка нетехнічна подія в місяці.
    true                                                as is_visitor,
    a.is_core_active,
    a.did_activation_action,
    a.did_value_action,

    -- Воронка активації (Стр.2): нові юзери місяця діляться на активованих
    -- (зробили термінальну цільову дію в місяць приходу) і пасивно
    -- активованих (прийшли, але цільової дії не зробили).
    a.is_new_user and coalesce(act.is_activated_in_cohort, false)
                                                        as is_activated_user,
    a.is_new_user and not coalesce(act.is_activated_in_cohort, false)
                                                        as is_passively_activated_user,

    a.n_events,
    a.n_active_days,
    a.n_core_events,
    a.n_core_days,
    a.n_sessions,
    a.total_session_sec,
    round(a.total_session_sec / 60.0, 2)                as total_session_min,

    a.last_app_version,
    a.last_os_type,

    ls.last_active_month,
    ls.last_event_at,

    -- Сегмент життєвого циклу на СЬОГОДНІ (снепшот, не історичний ряд) —
    -- Стр.3 донат "Активні / Сплячі / Ризик відтоку / Загублені / Мертві душі".
    case
        when date_diff(current_date(), date(ls.last_event_at), day) <= 30  then '1. Активні (< 1 міс)'
        when date_diff(current_date(), date(ls.last_event_at), day) <= 90  then '2. Сплячі (1-3 міс)'
        when date_diff(current_date(), date(ls.last_event_at), day) <= 180 then '3. Ризик відтоку (3-6 міс)'
        when date_diff(current_date(), date(ls.last_event_at), day) <= 365 then '4. Загублені (6-12 міс)'
        else '5. Мертві душі (> 1 року)'
    end                                                 as lifecycle_segment_current

from activity as a
left join activation as act on act.user_phone_sk = a.user_phone_sk
left join last_seen as ls   on ls.user_phone_sk  = a.user_phone_sk
