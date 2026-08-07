-- Grain: complex_id × report_month. Кількість мешканців, порахована З НУЛЯ
-- з `users` + прив'язок до приміщень, а НЕ взята з `statistic_citizen`.
--
-- ── Навіщо (рішення Микити 2026-08-04) ────────────────────────────────────
-- `statistic_citizen` — готовий місячний агрегат від джерела, і незрозуміло,
-- як саме він рахується. Перевірка показала щонайменше одну конкретну проблему:
-- він **не виключає деактивовані будинки** — ЖК «Севен» пішов з УК у вер-жовт
-- 2025, а снапшот показував 2 911 користувачів у квіт.2026, через півроку.
-- Тому рахуємо самі, через спільний `int_user_exclusions`: те саме визначення
-- бази, що й у продуктовому домені, і видно, з чого складається кожне число.
--
-- ⚠️ Числа НЕ збігатимуться з `fact_citizen_snapshot` і з xlsx-звітом, який
-- будувався на тому ж джерелі. Обидва набори лишаються поруч у
-- mart_monthly_complex_overview (колонки `*_src` — снапшот) для звірки.
--
-- Прив'язка користувача до ЖК:
--   * `n_users_*` (чиста база)  → primary_complex_id — ЖК серед АКТИВНИХ будинків
--   * `n_excluded_*`            → home_complex_id — ЖК серед усіх будинків,
--                                 інакше відсіяні люди не мали б ЖК взагалі
-- В обох випадках користувач рахується РІВНО ОДИН РАЗ (рішення Микити:
-- «два особові рахунки = один користувач»), тому суму по ЖК можна брати як тотал.
--
-- ⚠️ Аналога `statistic_citizen.active_user` тут СВІДОМО немає. "Активний
-- користувач" — це продуктове визначення (виконав core-подію за місяць), воно
-- вже є в `dbt_product.mart_user_base_monthly.active_core_mau` з явним списком
-- подій із seed'а. Заводити тут другий підрахунок означало б повторити ту саму
-- помилку, від якої тікаємо. Стара колонка лишилась як `n_users_active_src`.

with exclusions as (

    select * from {{ ref('int_user_exclusions') }}

),

-- Чиста база: активні мешканці, віднесені до ЖК активного будинку.
active_base as (

    select
        report_month,
        primary_complex_id                                          as complex_id,
        count(distinct user_id)                                     as n_users_total,
        count(distinct if(is_confirmed, user_id, null))              as n_users_confirmed,
        count(distinct if(not is_verified, user_id, null))           as n_users_unconfirmed,
        count(distinct if(is_owner, user_id, null))                  as n_owners,
        count(distinct if(not is_owner, user_id, null))              as n_tenants
    from exclusions
    where is_active_resident
    group by report_month, primary_complex_id

),

-- Діагностика: кого і чому відсіяли, у розрізі "домашнього" ЖК.
excluded as (

    select
        report_month,
        home_complex_id                                             as complex_id,
        count(distinct user_id)                                     as n_with_space_any_status,
        count(distinct if(exclusion_reason = 'house_deactivated', user_id, null)) as n_excluded_house_deactivated,
        count(distinct if(exclusion_reason = 'role_deactivated',  user_id, null)) as n_excluded_role_deactivated,
        count(distinct if(exclusion_reason = 'employee',          user_id, null)) as n_excluded_employees,
        count(distinct if(exclusion_reason = 'test_complex',      user_id, null)) as n_excluded_test_complex
    from exclusions
    group by report_month, home_complex_id

),

complexes as (

    select complex_id, complex_name, is_test_complex from {{ ref('dim_complex') }}

)

select
    coalesce(a.report_month, e.report_month)                        as report_month,
    coalesce(a.complex_id, e.complex_id)                            as complex_id,
    c.complex_name,
    c.is_test_complex,

    coalesce(a.n_users_total, 0)                                    as n_users_total,
    coalesce(a.n_users_confirmed, 0)                                as n_users_confirmed,
    coalesce(a.n_users_unconfirmed, 0)                              as n_users_unconfirmed,
    coalesce(a.n_owners, 0)                                         as n_owners,
    coalesce(a.n_tenants, 0)                                        as n_tenants,
    safe_divide(a.n_users_confirmed, a.n_users_total)               as rate_confirmed,

    coalesce(e.n_with_space_any_status, 0)                          as n_with_space_any_status,
    coalesce(e.n_excluded_house_deactivated, 0)                     as n_excluded_house_deactivated,
    coalesce(e.n_excluded_role_deactivated, 0)                      as n_excluded_role_deactivated,
    coalesce(e.n_excluded_employees, 0)                             as n_excluded_employees,
    coalesce(e.n_excluded_test_complex, 0)                          as n_excluded_test_complex

from active_base as a
full join excluded as e
       on e.report_month = a.report_month
      and e.complex_id   = a.complex_id
left join complexes as c
       on c.complex_id = coalesce(a.complex_id, e.complex_id)
where coalesce(a.complex_id, e.complex_id) is not null
