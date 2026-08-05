-- Стр.3 (низ) — відвал по модулях. Грануляція: module_code (снепшот на
-- current_date(), не історичний ряд — як і в оригіналі).
--
-- true_module_drop_off_rate — частка тих, хто КИНУВ МОДУЛЬ, але лишився в
-- застосунку (щоб не плутати відвал модуля із загальним відтоком).
-- Вікно відвалу (30/90/180 днів) тепер із seed product_module_catalog, раніше
-- було третім захардкодженим CASE у custom_retention_4.

with events as (

    select
        user_phone_sk,
        event_date,
        module_code
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
      and not coalesce(is_technical, false)
      and module_code is not null

),

global_activity as (

    select
        user_phone_sk,
        max(event_date) as global_last_active_date
    from events
    group by user_phone_sk

),

user_module_lifecycle as (

    select
        e.user_phone_sk,
        e.module_code,
        g.global_last_active_date,
        min(e.event_date)               as first_use_date,
        max(e.event_date)               as last_use_date,
        count(distinct e.event_date)    as active_days_count
    from events as e
    inner join global_activity as g using (user_phone_sk)
    group by e.user_phone_sk, e.module_code, g.global_last_active_date

),

modules as (

    select module_code, module_name_ua, module_order, drop_off_window_days, module_label_with_window
    from {{ ref('dim_app_module') }}
    where not is_technical

),

metrics as (

    select
        l.module_code,
        l.user_phone_sk,
        date_diff(l.last_use_date, l.first_use_date, day)            as lifetime_days,
        l.active_days_count,
        date_diff(current_date(), l.global_last_active_date, day) > 60   as is_app_churned,
        date_diff(current_date(), l.last_use_date, day) > m.drop_off_window_days
                                                                    as is_module_dropped
    from user_module_lifecycle as l
    inner join modules as m on m.module_code = l.module_code

)

select
    m.module_code,
    mod.module_name_ua,
    mod.module_order,
    mod.drop_off_window_days,
    mod.module_label_with_window,

    count(*)                                                        as total_users_tried,

    -- Відвал МОДУЛЯ серед тих, хто ще в застосунку.
    safe_divide(
        countif(not m.is_app_churned and m.is_module_dropped),
        countif(not m.is_app_churned)
    )                                                               as true_module_drop_off_rate,

    -- Загальний відтік із застосунку серед тих, хто пробував модуль.
    safe_divide(countif(m.is_app_churned), count(*))                as app_churn_rate,

    approx_quantiles(
        if(not m.is_app_churned and m.is_module_dropped, m.lifetime_days, null), 100
    )[offset(50)]                                                   as median_days_before_drop,

    round(avg(safe_divide(m.lifetime_days, nullif(m.active_days_count - 1, 0))), 1)
                                                                    as avg_days_between_sessions

from metrics as m
left join modules as mod on mod.module_code = m.module_code
group by m.module_code, mod.module_name_ua, mod.module_order,
         mod.drop_off_window_days, mod.module_label_with_window
