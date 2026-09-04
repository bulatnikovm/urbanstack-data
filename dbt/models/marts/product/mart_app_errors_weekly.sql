-- Помилки в розрізі РЕЛІЗУ. Грануляція: event_week × os_type × app_version × error_kind.
--
-- Це головна витрина сторінки «Стан додатку»: баг живе всередині версії, і
-- побачити його можна тільки там, де версія є виміром. Приклад із реальних
-- даних (вер. 2026): екран «щось пішло не так» — 113 подій у 6 людей на iOS
-- 1.4.9 з 13.07 по 11.08, і майже нічого на сусідніх версіях. У місячному
-- зрізі по всьому застосунку це 0,1% і не видно взагалі.
--
-- ── Чому знаменник свій на кожну версію ──────────────────────────────────
-- Частку треба рахувати від активних ЦІЄЇ Ж версії, інакше показник міряє
-- розкотку, а не якість: щойно випущений реліф має мало користувачів, і будь-яка
-- його помилка виглядає мізерною часткою від усієї аудиторії. А коли реліз
-- розкотиться — та сама поломка «раптом» виросте, хоча нічого не змінилось.
--
-- ⚠️ Людина за тиждень може побувати на двох версіях (оновилась) і тоді
-- потрапляє в знаменник обох. Це навмисно: вона справді була піддана обом.
-- Наслідок — суму `version_active_users` по версіях НЕ можна вважати
-- аудиторією тижня, для цього є `mart_app_errors_monthly.active_users`.

with events as (

    select
        event_week,
        os_type,
        app_version,
        user_phone_sk,
        error_kind
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
      and os_type is not null
      and app_version is not null

      -- Нижня межа — див. коментар у `mart_app_errors_monthly`. Саме вона
      -- прибирає тижні 1969-12-29 / 2009-12-28 / 2021-08-23 від кривих
      -- годинників на клієнтах.
      and event_week >= '2024-01-01'

),

version_active as (

    select
        event_week,
        os_type,
        app_version,
        count(distinct user_phone_sk)                       as version_active_users
    from events
    group by 1, 2, 3

),

by_kind as (

    select
        event_week,
        os_type,
        app_version,
        error_kind,
        count(*)                                            as error_events,
        count(distinct user_phone_sk)                       as affected_users
    from events
    where error_kind is not null and error_kind != ''
    group by 1, 2, 3, 4

)

select
    k.event_week,
    k.os_type,
    k.app_version,
    k.error_kind,
    c.error_class,
    c.label_ua,

    k.affected_users,
    k.error_events,
    v.version_active_users,

    safe_divide(k.affected_users, v.version_active_users)    as affected_rate,
    safe_divide(k.error_events, k.affected_users)            as events_per_affected

from by_kind as k
left join version_active as v
       on  v.event_week  = k.event_week
       and v.os_type     = k.os_type
       and v.app_version = k.app_version
left join {{ ref('product_error_catalog') }} as c on c.error_kind = k.error_kind
