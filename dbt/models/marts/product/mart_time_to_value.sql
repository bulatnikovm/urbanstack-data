-- Стр.2 — "Час до цінної дії". Грануляція: report_month (когорта приходу).
--
-- ⚠️ v2 (2026-08-06, рішення Микити): замінено медіану на РОЗПОДІЛ.
-- Медіана на цьому розподілі не говорить ні про що — вікно 30 днів дає
-- медіану ~12 хв (СКД у списку цінних дій, а по нього відчиняють двері одразу
-- після встановлення), і P90 ~300+ год. Ані "швидко", ані "довго" тут немає
-- єдиного числа, яке можна прочитати.
--
-- Замість цього — накопичена частка нових користувачів, що зробили цінну дію
-- за 1 годину / 1 день / 7 днів / 30 днів від першого входу. Це відповідає
-- на реальне питання ("як швидко доходять до цінності") і не ламається на
-- асиметрії розподілу.
--
-- Той самий баг оригіналу лишається виправленим (три події без ком у списку
-- custom_new_users__d303fc10.sql — див. git-історію цього файлу v1).
-- "Цінна дія" = is_value_action із seed'а (усі ТЕРМІНАЛЬНІ УСПІШНІ дії).

with first_seen as (

    select
        user_phone_sk,
        min(event_time)                     as first_seen_at,
        min(event_month)                    as cohort_month
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
      and not coalesce(is_technical, false)
    group by user_phone_sk

),

first_value as (

    select
        user_phone_sk,
        min(event_time)                     as first_value_at
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
      and is_value_action
    group by user_phone_sk

),

timings as (

    select
        fs.user_phone_sk,
        fs.cohort_month,
        timestamp_diff(fv.first_value_at, fs.first_seen_at, minute) as minutes_to_value
    from first_seen as fs
    inner join first_value as fv using (user_phone_sk)
    where fv.first_value_at >= fs.first_seen_at
      -- Те саме вікно, що в оригіналі: цікавить швидка активація, не "колись".
      and timestamp_diff(fv.first_value_at, fs.first_seen_at, day) < 30

),

by_cohort as (

    select
        cohort_month                                            as report_month,
        count(*)                                                as n_users_with_value_action,
        countif(minutes_to_value <= 60)                         as within_1h,
        countif(minutes_to_value <= 60 * 24)                    as within_1d,
        countif(minutes_to_value <= 60 * 24 * 7)                as within_7d,
        countif(minutes_to_value <= 60 * 24 * 30)               as within_30d
    from timings
    group by cohort_month

)

select
    report_month,
    format_date('%Y-%m', report_month)                          as report_month_key,
    n_users_with_value_action,
    within_1h,
    within_1d,
    within_7d,
    within_30d,
    safe_divide(within_1h,  n_users_with_value_action)          as rate_1h,
    safe_divide(within_1d,  n_users_with_value_action)          as rate_1d,
    safe_divide(within_7d,  n_users_with_value_action)          as rate_7d,
    safe_divide(within_30d, n_users_with_value_action)          as rate_30d
from by_cohort

union all

select
    null                                                        as report_month,
    'ALL'                                                       as report_month_key,
    count(*),
    countif(minutes_to_value <= 60),
    countif(minutes_to_value <= 60 * 24),
    countif(minutes_to_value <= 60 * 24 * 7),
    countif(minutes_to_value <= 60 * 24 * 30),
    safe_divide(countif(minutes_to_value <= 60),            count(*)),
    safe_divide(countif(minutes_to_value <= 60 * 24),       count(*)),
    safe_divide(countif(minutes_to_value <= 60 * 24 * 7),   count(*)),
    safe_divide(countif(minutes_to_value <= 60 * 24 * 30),  count(*))
from timings
