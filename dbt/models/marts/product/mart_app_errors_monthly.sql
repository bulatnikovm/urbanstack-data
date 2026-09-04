-- Помилки застосунку по місяцях. Грануляція: report_month × error_kind.
--
-- Навіщо окремо від `mart_app_errors_weekly`: тижнева грануляція відповідає на
-- питання «який реліз зламався» (баг живе всередині версії), а місячна —
-- «чи стало гірше взагалі». Друге потрібне детектору аномалій, який увесь
-- побудований на місяцях (`srv_metric_timeseries`), і згорнути тижні в місяці
-- на дашборді НЕ можна: distinct-людей не додаються.
--
-- ── Знаменник ────────────────────────────────────────────────────────────
-- Частка рахується від УСІХ активних за місяць, а не від тих, хто бачив
-- помилку. Інакше показник перетворюється на «серед тих, у кого зламалось,
-- скільки бачили це багато разів» — і при повному провалі релізу він
-- дорівнює 100% і не рухається.
--
-- ⚠️ Активні тут — будь-яка подія за місяць, а НЕ `news_scrn__view`, як у
-- `mart_app_health_weekly`. Вузьке визначення вже одного разу дало хибну
-- картину по ОС (CLAUDE.md §8в), і для знаменника помилок воно тим більше не
-- годиться: людина, у якої застосунок падає на старті, стрічку новин просто
-- не побачить і з знаменника зникне — рівно тоді, коли має в ньому бути.

with events as (

    select
        event_month,
        user_phone_sk,
        error_kind
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null

      -- Та сама нижня межа, що в `srv_metric_timeseries`: до 2024 в Amplitude
      -- технічний шум (є події з міткою 1970-го — кривий годинник клієнта).
      -- Без неї у витрину потрапляють тижні 1969-12-29 і 2009-12-28 з нулем
      -- людей: на графіку їх не видно, але вісь вони розтягують на 55 років.
      and event_month >= '2024-01-01'

),

-- Знаменник: скільки людей взагалі користувались застосунком того місяця.
active as (

    select
        event_month,
        count(distinct user_phone_sk)                       as active_users
    from events
    group by 1

),

by_kind as (

    select
        event_month,
        error_kind,
        count(*)                                            as error_events,
        count(distinct user_phone_sk)                       as affected_users
    from events
    where error_kind is not null and error_kind != ''
    group by 1, 2

)

select
    k.event_month                                           as report_month,
    format_date('%Y-%m', k.event_month)                     as report_month_key,
    k.error_kind,
    c.error_class,
    c.label_ua,
    c.hint_ua,

    k.affected_users,
    k.error_events,
    a.active_users,

    -- Скільки людей це зачепило, у частках від усієї активної аудиторії.
    safe_divide(k.affected_users, a.active_users)            as affected_rate,

    -- ⚠️ Друге число, без якого перше бреше. Одна й та сама «частка 0,3%»
    -- буває двома різними аваріями: 10 людей, кожна вперлась 22 рази (зламаний
    -- сценарій у вузької групи), і 220 людей по одному разу (загальна
    -- шорсткість). Перше — терміново, друге — у беклог.
    safe_divide(k.error_events, k.affected_users)            as events_per_affected

from by_kind as k
left join active as a on a.event_month = k.event_month
left join {{ ref('product_error_catalog') }} as c on c.error_kind = k.error_kind
