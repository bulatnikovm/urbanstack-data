-- Сесії застосунку. Грануляція: session_id × user_phone_sk.
--
-- Уніфікує ТРИ розбіжні визначення сесії, що співіснували в Looker:
--   custom_core_events_5  — без відсіву session_id = -1, без верхньої межі
--   custom_events_usage   — з відсівом, cap 14 400 сек (4 год)
--   custom_events_usage_2 — те саме, але з групуванням по користувачу
-- Канонічне (2 з 3 запитів + здоровий глузд): session_id не -1 (вже NULL у
-- staging), >1 події в сесії, тривалість > 0 і < 4 год.
--
-- Наслідок: "середній денний актив"/"медіанний час сесії" на Стр.3 зміняться —
-- раніше один із трьох графіків рахувався без відсіву аномальних сесій.

with events as (

    select * from {{ ref('stg_amplitude__events') }}
    where session_id is not null

),

sessions as (

    select
        session_id,
        user_phone_sk,
        min(event_time)                             as session_start_at,
        max(event_time)                             as session_end_at,
        date(min(event_time))                       as session_date,
        date_trunc(date(min(event_time)), month)    as session_month,
        count(*)                                    as n_events,
        timestamp_diff(max(event_time), min(event_time), second) as duration_sec
    from events
    group by session_id, user_phone_sk

)

select *
from sessions
where n_events > 1
  and duration_sec > 0
  and duration_sec < 14400
