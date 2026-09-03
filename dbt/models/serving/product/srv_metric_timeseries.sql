-- Усі продуктові метрики в ОДНОМУ довгому форматі.
-- Грануляція: series_key × dimension_value × report_month.
--
-- Навіщо (dashboard_plan.md §7.1): 30 показників розкидані по 8 wide-мартах з
-- різними колонками. Щоб детектор аномалій не писався окремо під кожен графік,
-- їх треба звести до однієї вузької таблиці. Виграш не в розмірі, а в тому, що
-- з'являється ОДНА сутність: один рушій аномалій, одне джерело для анотацій на
-- графіках, один об'єкт для майбутнього агента.
--
-- ── Чому не Jinja-цикл по seed'у ─────────────────────────────────────────
-- Спокуса — згенерувати union'и циклом по `product_metric_series`. Так робити
-- не можна: `ref()` резолвиться на етапі ПАРСИНГУ, коли `execute` = false і
-- цикл порожній, тому dbt не побачить залежностей і зможе побудувати цю модель
-- ДО мартів. Тому union'и явні, а seed тримає тільки метадані.
--
-- Розсинхрон між цим файлом і seed'ом ловиться тестом
-- `series_key` ⊆ seed і seed ⊆ `series_key` (див. _serving__models.yml) —
-- додав колонку сюди, забув рядок у seed → падає збірка, а не мовчить.
--
-- Додати метрику = рядок у seed + колонка в потрібному unpivot нижче.

with

-- ── Тотали по компанії ───────────────────────────────────────────────────
base_totals as (

    select
        report_month,
        'Усього'                                as dimension_value,
        concat('total.', metric_col)            as series_key,
        value
    from (
        select
            report_month,
            cast(count_potential  as float64)   as count_potential,
            cast(count_confirmed  as float64)   as count_confirmed,
            cast(rate_confirmed   as float64)   as rate_confirmed,
            cast(visitors         as float64)   as visitors,
            cast(active_core_mau  as float64)   as active_core_mau
        from {{ ref('mart_user_base_totals_monthly') }}
    )
    unpivot (value for metric_col in (
        count_potential, count_confirmed, rate_confirmed, visitors, active_core_mau
    ))

),

activation as (

    select
        report_month,
        'Усього'                                as dimension_value,
        concat('total.', metric_col)            as series_key,
        value
    from (
        select
            report_month,
            cast(count_new_users  as float64)   as count_new_users,
            cast(count_activated  as float64)   as count_activated,
            cast(activation_rate  as float64)   as activation_rate
        from {{ ref('mart_activation_monthly') }}
    )
    unpivot (value for metric_col in (
        count_new_users, count_activated, activation_rate
    ))

),

engagement as (

    select
        report_month,
        'Усього'                                        as dimension_value,
        concat('total.', metric_col)                    as series_key,
        value
    from (
        select
            report_month,
            cast(avg_daily_core_users       as float64) as avg_daily_core_users,
            cast(n_sessions                 as float64) as n_sessions,
            cast(median_session_min         as float64) as median_session_min,
            cast(median_user_time_min       as float64) as median_user_time_min,
            cast(voting_conversion_rate     as float64) as voting_conversion_rate,
            cast(app_requests_created_users as float64) as app_requests_created_users
        from {{ ref('mart_engagement_monthly') }}
    )
    unpivot (value for metric_col in (
        avg_daily_core_users, n_sessions, median_session_min,
        median_user_time_min, voting_conversion_rate, app_requests_created_users
    ))

),

time_to_value as (

    select
        report_month,
        'Усього'                                            as dimension_value,
        concat('total.', metric_col)                        as series_key,
        value
    from (
        select
            report_month,
            cast(n_users_with_value_action as float64)      as n_users_with_value_action,
            cast(rate_1d                   as float64)      as rate_1d
        from {{ ref('mart_time_to_value') }}
    )
    unpivot (value for metric_col in (n_users_with_value_action, rate_1d))

),

receipts as (

    select
        report_month,
        'Усього'                                                as dimension_value,
        -- receipts_accepted_avg_amount задовге для ключа — скорочуємо явно,
        -- щоб series_key лишався читабельним у UI.
        case metric_col
            when 'receipts_accepted_avg_amount' then 'total.receipts_avg_amount'
            else concat('total.', metric_col)
        end                                                     as series_key,
        value
    from (
        select
            report_month,
            cast(receipts_accepted            as float64)       as receipts_accepted,
            cast(receipts_rejected_rate       as float64)       as receipts_rejected_rate,
            cast(receipts_accepted_amount     as float64)       as receipts_accepted_amount,
            cast(receipts_accepted_avg_amount as float64)       as receipts_accepted_avg_amount
        from {{ ref('mart_utility_receipts_monthly') }}
    )
    unpivot (value for metric_col in (
        receipts_accepted, receipts_rejected_rate,
        receipts_accepted_amount, receipts_accepted_avg_amount
    ))

),

-- ── Розрізи ──────────────────────────────────────────────────────────────
star as (

    select
        report_month,
        star_category                                       as dimension_value,
        case metric_col
            when 'unique_users'           then 'star.unique_users'
            when 'star_rate_of_confirmed' then 'star.rate_of_confirmed'
        end                                                 as series_key,
        value
    from (
        select
            report_month,
            star_category,
            cast(unique_users           as float64)         as unique_users,
            cast(star_rate_of_confirmed as float64)         as star_rate_of_confirmed
        from {{ ref('mart_star_monthly') }}
    )
    unpivot (value for metric_col in (unique_users, star_rate_of_confirmed))

),

by_complex as (

    select
        report_month,
        complex_name                                    as dimension_value,
        concat('complex.', metric_col)                  as series_key,
        value
    from (
        select
            report_month,
            complex_name,
            cast(count_potential as float64)            as count_potential,
            cast(count_confirmed as float64)            as count_confirmed,
            cast(active_core_mau as float64)            as active_core_mau
        from {{ ref('mart_user_base_monthly') }}
    )
    unpivot (value for metric_col in (
        count_potential, count_confirmed, active_core_mau
    ))

),

segments as (

    select
        report_month,
        complex_name                                    as dimension_value,
        concat('complex.', metric_col)                  as series_key,
        value
    from (
        -- ⚠️ `segment_alive` свідомо НЕ береться: перевірено — він збігається
        -- з `active_core_mau` у ВСІХ 316 рядках, до одиниці. Це один і той
        -- самий показник під двома назвами («Живі» = MAU з цільовою дією).
        -- Якщо взяти обидва, детектор дублюватиме кожну тривогу, а наратив
        -- двічі розкаже ту саму новину. Беремо `complex.active_core_mau`.
        select
            report_month,
            complex_name,
            cast(segment_sleeping as float64)           as segment_sleeping,
            cast(segment_dead     as float64)           as segment_dead
        from {{ ref('mart_user_segments_monthly') }}
    )
    unpivot (value for metric_col in (
        segment_sleeping, segment_dead
    ))

),

modules as (

    select
        report_month,
        module_name_ua                                  as dimension_value,
        concat('module.', metric_col)                   as series_key,
        value
    from (
        select
            report_month,
            module_name_ua,
            cast(module_users    as float64)            as module_users,
            cast(penetration_rate as float64)           as penetration_rate
        from {{ ref('mart_module_usage_monthly') }}
    )
    unpivot (value for metric_col in (module_users, penetration_rate))

),

unioned as (
    select * from base_totals
    union all select * from activation
    union all select * from engagement
    union all select * from time_to_value
    union all select * from receipts
    union all select * from star
    union all select * from by_complex
    union all select * from segments
    union all select * from modules
),

meta as (

    select * from {{ ref('product_metric_series') }}

)

select
    'urbanstack'                                        as tenant_id,
    u.series_key,

    -- Назва РЯДУ, а не картки дашборду. Окремо від metric_id навмисно: одна
    -- картка реєстру покриває кілька рядів (PROD-041 — це і потенційні, і
    -- підтверджені, і MAU по ЖК; PROD-011 — і користувачі модуля, і
    -- покриття). Брати підпис з реєстру означало б назвати три різні ряди
    -- однаково — рівно це й сталось у першому наративі.
    m.label_ua,
    m.metric_id,
    m.dimension_key,
    m.dashboard_section,
    u.dimension_value,
    u.report_month,
    format_date('%Y-%m', u.report_month)                as report_month_key,
    u.value,

    -- Метадані потрібні прямо тут: детектор і UI читають одну таблицю й не
    -- мусять кожен раз джойнити seed.
    m.value_type,
    m.source_kind,
    m.direction_good,
    m.min_abs_change,
    m.mom_pct_threshold

-- ⚠️ LEFT, а не INNER — навмисно. При INNER колонка, додана в unpivot без
-- рядка в seed'і, просто зникла б із результату МОВЧКИ: рівно той механізм
-- розходження, від якого ми тікаємо. З LEFT вона дає metric_id = null і
-- валить тест not_null на збірці.
from unioned as u
left join meta as m on m.series_key = u.series_key
where u.value is not null

  -- Та сама межа й та сама підстава, що в `int_user_exclusions`: до жовтня
  -- 2023 в Amplitude технічний шум (є навіть подія з міткою 1970-го), а
  -- реальний притік починається з січня 2024. Без цієї межі в ряди потрапляють
  -- місяці зі значенням 0-1 (2010-01, 2021-08, 2022-06 — кривий годинник
  -- клієнта), і вони ламають медіану з MAD на старті кожного ряду.
  and u.report_month >= '2024-01-01'

  -- `mart_time_to_value` містить рядок з report_month = NULL (агрегат «за весь
  -- час», 4 247 юзерів, лежить усередині помісячного марта). У часовий ряд
  -- йому не можна — це не місяць.
  and u.report_month is not null
