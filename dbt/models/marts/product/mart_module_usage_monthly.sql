-- Стр.3 — "Використання модулів у додатку". Грануляція: report_month × module.
--
-- Час у модулі рахується як у оригіналі: тривалість події = різниця до
-- наступної події в тій самій сесії, з відсіканням (NULL → 5 сек, >30 хв → 300
-- сек). Це евристика, але вона канонічна для цього дашборду.
--
-- ⚠️ Мапінг модулів тепер із seed'а, а не з CASE. Наслідки:
--   * покриття 100% подій замість 76% — з'явились модулі Сповіщення (246k
--     подій), Віджети (121k), Об'єкти (40k), Тимчасові доступи, Гардіан, які
--     раніше падали в 'Інше' і викидались;
--   * зникла розбіжність '7. Профіль та Авторизація' vs '7. Профіль' між двома
--     графіками однієї сторінки.
-- Технічні події (session_start/end, no_internet, something_went_wrong)
-- виключені явним прапорцем is_technical, а не мовчазним 'Інше'.

with events as (

    select
        event_month,
        event_time,
        session_id,
        user_phone_sk,
        module_code
    from {{ ref('int_events_enriched') }}
    where user_phone_sk is not null
      and not coalesce(is_technical, false)
      and module_code is not null

),

with_duration as (

    select
        *,
        timestamp_diff(
            lead(event_time) over (partition by session_id order by event_time),
            event_time,
            second
        ) as raw_duration_sec
    from events

),

capped as (

    select
        event_month,
        user_phone_sk,
        module_code,
        case
            when raw_duration_sec is null then 5
            when raw_duration_sec > 1800  then 300
            when raw_duration_sec < 0     then 5
            else raw_duration_sec
        end as duration_sec
    from with_duration

),

user_module as (

    select
        event_month,
        user_phone_sk,
        module_code,
        sum(duration_sec) as user_time_in_module_sec
    from capped
    group by event_month, user_phone_sk, module_code

),

monthly_active as (

    select
        event_month,
        count(distinct user_phone_sk) as total_active_users
    from events
    group by event_month

)

select
    um.event_month                                                      as report_month,
    format_date('%Y-%m', um.event_month)                                as report_month_key,
    um.module_code,
    m.module_name_ua,
    m.module_order,

    count(distinct um.user_phone_sk)                                    as module_users,
    safe_divide(count(distinct um.user_phone_sk), any_value(ma.total_active_users))
                                                                        as penetration_rate,
    round(approx_quantiles(um.user_time_in_module_sec, 100)[offset(50)] / 60.0, 2)
                                                                        as median_time_min,
    round(approx_quantiles(um.user_time_in_module_sec, 100)[offset(90)] / 60.0, 2)
                                                                        as p90_time_min,
    round(sum(um.user_time_in_module_sec) / 60.0, 2)                    as total_time_min

from user_module as um
left join {{ ref('dim_app_module') }} as m on m.module_code = um.module_code
left join monthly_active as ma on ma.event_month = um.event_month
group by um.event_month, um.module_code, m.module_name_ua, m.module_order
