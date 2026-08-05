-- Стр.2 — Активація. Грануляція: report_month (когорта приходу).
--
-- Нові користувачі місяця діляться на:
--   Activated          — зробили ТЕРМІНАЛЬНУ цільову дію в місяць приходу
--   Passively Activated — прийшли, але цільової дії не зробили
-- Конверсія = Activated / New.
--
-- Список цільових дій — seed product_event_catalog (is_activation_event):
-- 4 термінальні дії (заявка створена, оплата успішна, проголосував, платна
-- послуга замовлена). Це збігається з поточним дашбордом.

with cohort as (

    select
        cohort_month                                            as report_month,
        count(distinct user_phone_sk)                           as count_new_users,
        count(distinct if(is_activated_user, user_phone_sk, null))
                                                                as count_activated,
        count(distinct if(is_passively_activated_user, user_phone_sk, null))
                                                                as count_passively_activated
    from {{ ref('fct_user_monthly') }}
    where is_new_user
    group by cohort_month

)

select
    report_month,
    format_date('%Y-%m', report_month)                          as report_month_key,
    count_new_users,
    count_activated,
    count_passively_activated,
    safe_divide(count_activated, count_new_users)               as activation_rate,
    safe_divide(
        count_new_users - lag(count_new_users) over (order by report_month),
        lag(count_new_users) over (order by report_month)
    )                                                           as new_users_mom_change
from cohort
