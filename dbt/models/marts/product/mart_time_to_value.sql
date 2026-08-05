-- Стр.2 — "Медіанна к-сть годин до цінної дії". Один рядок (снепшот) +
-- розбивка по когортах.
--
-- ⚠️ ВИПРАВЛЕНО БАГ оригіналу. У custom_new_users__d303fc10.sql список подій
-- був записаний так:
--     ... 'paid_service_description_popup_success_view' 'widget_home_scrn__view' 'widget_home_key_btn__click')
-- — три літерали БЕЗ КОМ. BigQuery конкатенує суміжні рядкові літерали
-- (перевірено: SELECT 'a' 'b' 'c' → 'abc'), тож в IN потрапляв один
-- неіснуючий рядок і ці три події мовчки не рахувались. Метрика "41,2 год"
-- була порахована по 3 подіях замість 6.
--
-- Тут "цінна дія" = is_value_action із seed'а: усі ТЕРМІНАЛЬНІ УСПІШНІ дії
-- (заявка, оплата успішна, голос, платна послуга, СКД, тимчасовий доступ).
-- Невдала оплата навмисно виключена — це не цінність для юзера.
-- Наслідок: цифра зміниться проти дашборду (СКД частий → медіана впаде).

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

)

select
    cohort_month                                                    as report_month,
    format_date('%Y-%m', cohort_month)                              as report_month_key,
    count(*)                                                        as n_users_with_value_action,
    approx_quantiles(minutes_to_value, 100)[offset(50)]             as median_minutes_to_value,
    round(approx_quantiles(minutes_to_value, 100)[offset(50)] / 60.0, 1)  as median_hours_to_value,
    round(approx_quantiles(minutes_to_value, 100)[offset(90)] / 60.0, 1)  as p90_hours_to_value
from timings
group by cohort_month

union all

select
    null                                                            as report_month,
    'ALL'                                                           as report_month_key,
    count(*),
    approx_quantiles(minutes_to_value, 100)[offset(50)],
    round(approx_quantiles(minutes_to_value, 100)[offset(50)] / 60.0, 1),
    round(approx_quantiles(minutes_to_value, 100)[offset(90)] / 60.0, 1)
from timings
