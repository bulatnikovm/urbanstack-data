-- Зведення помилок по КЛАСАХ. Грануляція: report_month × error_class.
--
-- ⚠️ Модель існує рівно тому, що `mart_app_errors_monthly` НЕ МОЖНА згортати
-- складанням. Людина, яка за місяць побачила і «оплата не пройшла», і «послуга
-- недоступна», лежить у двох рядках; сума `affected_users` порахує її двічі й
-- дасть завищене «стільки людей бачили помилку». Distinct треба рахувати на
-- тій грануляції, на якій його показують, — і тільки в SQL, бо на дашборді
-- окремих людей уже немає.
--
-- Класи (довідник `product_error_catalog`) навмисно не складаються в один
-- «рівень помилок»:
--   app    — зламався застосунок чи бекенд. Це наша відповідальність;
--   auth   — тертя на вході: невірний PIN, невірний код. Здебільшого сам
--            користувач, і нульовим цей клас не буває ніколи;
--   access — прав немає або номера немає в базі. Питання до операційки й
--            підключення, а не до розробки.
-- Змішати їх — отримати показник, який росте від того, що люди частіше
-- помиляються PIN-ом, і не рухається, коли падає оплата.
--
-- Клас `any` — окремий рядок, а не сума трьох: та сама причина, що вище.

with events as (

    select
        e.event_month,
        e.user_phone_sk,
        c.error_class
    from {{ ref('int_events_enriched') }} as e
    left join {{ ref('product_error_catalog') }} as c on c.error_kind = e.error_kind
    where e.user_phone_sk is not null
      and e.event_month >= '2024-01-01'

),

active as (

    select
        event_month,
        count(distinct user_phone_sk)                       as active_users
    from events
    group by 1

),

by_class as (

    select
        event_month,
        error_class,
        count(distinct user_phone_sk)                       as affected_users,
        count(*)                                            as error_events
    from events
    where error_class is not null
    group by 1, 2

    union all

    select
        event_month,
        'any'                                               as error_class,
        count(distinct user_phone_sk)                       as affected_users,
        count(*)                                            as error_events
    from events
    where error_class is not null
    group by 1

)

select
    b.event_month                                           as report_month,
    format_date('%Y-%m', b.event_month)                     as report_month_key,
    b.error_class,
    b.affected_users,
    b.error_events,
    a.active_users,
    safe_divide(b.affected_users, a.active_users)            as affected_rate,
    safe_divide(b.error_events, b.affected_users)            as events_per_affected

from by_class as b
left join active as a on a.event_month = b.event_month
