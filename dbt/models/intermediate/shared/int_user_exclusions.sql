-- ЄДИНИЙ МЕХАНІЗМ ВИКЛЮЧЕННЯ КОРИСТУВАЧІВ. Грануляція: user_id × report_month.
-- Спільний для продуктового й операційного доменів — рішення Микити 2026-08-04:
-- «краще створити щось одне по деактивованих користувачах і переюзати в дашбордах».
--
-- ── Навіщо ────────────────────────────────────────────────────────────────
-- Коли будинок іде з УК, УК НЕ відв'язує його жителів від квартир — свідомо,
-- щоб лишити можливість повернути їх (підтвердив Максим). Тобто в даних немає
-- жодного прапорця «цей житель більше не наш»: роль лишається ROLE_CITIZEN
-- (ЖК «Севен» пішов рік тому — 2 854 його жителі досі ROLE_CITIZEN; ЖК
-- «Варшавський Плюс» пішов 2026-08-01 — 1 496 жителів досі ROLE_CITIZEN).
--
-- Тому виключення рахуємо МИ САМІ, похідно від `houses.deactivated_at`. Це
-- автоматично оборотно: якщо будинок повернуть (deactivated_at очистять або
-- дата зміниться), жителі повернуться в підрахунки без жодних ручних правок —
-- ніякого seed'а зі списком людей вести не треба.
--
-- ── Три причини виключення ────────────────────────────────────────────────
--   employee          — співробітник УК, не мешканець
--   role_deactivated  — ROLE_INACTIVATED_CITIZEN (індивідуально з'їхав)
--   house_deactivated — усі його будинки деактивовані на цей місяць
-- Механізми НЕ синхронізовані, тому перевіряються всі три (перевірено на
-- даних: фільтр лише по ролі пропускає ~4,4 тис. людей з деактивованих домів,
-- фільтр лише по будинку — 579 індивідуально деактивованих).
--
-- ── Межа місяця ───────────────────────────────────────────────────────────
-- Будинок, деактивований 1 серпня, у СЕРПНІ вже НЕ рахується (рішення Микити
-- 2026-08-04). Порівнюємо на рівні МІСЯЦЯ, а не timestamp'а: `deactivated_at`
-- містить реальний час доби (напр. `2026-08-01 11:59:36`), тому порівняння з
-- північчю першого числа давало б хибний результат — будинок ще лічився б цілий
-- серпень. Умова активності: `місяць деактивації > звітний місяць`.
-- Наслідок: місяць деактивації виключається цілком, незалежно від дня.

with calendar as (

    -- 2024-01-01 — НЕ довільна дата. Перевірено по Amplitude (2026-08-06):
    -- до жовтня 2023 — технічний шум (одна подія навіть з міткою 1970-го),
    -- жовтень–грудень 2023 — 1→11 користувачів/міс (тестовий період, не
    -- продукт). Реальний, зростаючий притік починається тільки з січня 2024
    -- (19 юзерів і далі вгору). CRM (users.created_at) сягає 2021-12-27, але
    -- це нерелевантно — реєстрація в CRM ще не означає використання додатку.
    -- Рішення Микити (2026-08-06): лишити межу як є.
    {{ dbt_utils.date_spine(
        datepart="month",
        start_date="cast('2024-01-01' as date)",
        end_date="date_trunc(current_date(), month) + interval 1 month"
    ) }}

),

months as (

    select date_month as report_month from calendar
    where date_month <= date_trunc(current_date(), month)

),

links as (

    select * from {{ ref('int_user_space_links') }}

),

-- Прив'язки, розгорнуті по місяцях, з point-in-time статусом будинку.
link_months as (

    select
        m.report_month,
        l.user_id,
        l.space_id,
        l.house_id,
        l.complex_id,
        l.is_test_complex,
        l.is_apartment                                              as has_apartment,
        l.is_owner,
        l.role,
        l.is_citizen,
        l.is_role_deactivated,
        l.is_verified,
        l.user_phone_sk,
        l.user_created_month,
        l.house_created_at,
        l.house_deactivated_month,

        -- Будинок ще «наш» у цьому місяці? Тестові ЖК (seed test_complexes)
        -- не рахуються ніколи. Якщо в людини є приміщення і в тестовому, і в
        -- реальному ЖК — вона лишається в базі через реальний.
        (
            l.house_deactivated_month is null
            or l.house_deactivated_month > m.report_month
        ) and not l.is_test_complex                                 as is_house_active

    from links as l
    cross join months as m
    where l.user_created_month <= m.report_month
      and l.house_created_at < timestamp(date_add(m.report_month, interval 1 month))

),

per_user_month as (

    select
        report_month,
        user_id,
        any_value(user_phone_sk)                                    as user_phone_sk,
        any_value(role)                                             as role,
        max(is_citizen)                                             as is_citizen,
        max(is_role_deactivated)                                    as is_role_deactivated,
        max(is_verified)                                            as is_verified,
        min(user_created_month)                                     as user_created_month,

        -- ⚠️ Джерело має грануляцію user × SPACE, тому будинки рахуємо через
        -- COUNT(DISTINCT house_id), а не COUNT(*) — інакше людина з трьома
        -- приміщеннями в одному домі дала б «три будинки».
        count(distinct if(is_house_active, house_id, null))         as n_active_houses,
        count(distinct house_id)                                    as n_houses_total,
        count(distinct space_id)                                    as n_spaces_total,
        max(is_house_active)                                        as has_active_house,
        -- Усі приміщення людини — в тестових ЖК (напр. DIM 9000).
        min(is_test_complex)                                        as is_test_only,
        max(is_owner)                                               as is_owner

    from link_months
    group by report_month, user_id

),

-- Основний ЖК: користувач рахується РІВНО ОДИН РАЗ (рішення Микити 2026-08-04
-- — «два особові рахунки = один користувач»). Пріоритет: житло важливіше за
-- комерцію/паркінг, далі — найстаріший будинок, далі — complex_id для
-- детермінованості. Обираємо лише серед АКТИВНИХ на цей місяць будинків.
primary_complex as (

    select
        report_month,
        user_id,
        complex_id                                                  as primary_complex_id,
        house_id                                                    as primary_house_id
    from link_months
    where is_house_active
    qualify row_number() over (
        partition by report_month, user_id
        order by has_apartment desc, house_created_at, complex_id, house_id, space_id
    ) = 1

),

-- Той самий вибір, але серед УСІХ будинків (включно з деактивованими) — щоб
-- виключених користувачів теж можна було віднести до ЖК у діагностиці
-- («скільки людей ми відсіяли по цьому ЖК»).
home_complex as (

    select
        report_month,
        user_id,
        complex_id                                                  as home_complex_id
    from link_months
    qualify row_number() over (
        partition by report_month, user_id
        order by has_apartment desc, house_created_at, complex_id, house_id, space_id
    ) = 1

)

select
    u.report_month,
    u.user_id,
    u.user_phone_sk,
    u.role,
    u.is_citizen,
    u.is_verified,
    u.user_created_month,

    p.primary_complex_id,
    p.primary_house_id,
    hc.home_complex_id,
    u.n_active_houses,
    u.n_houses_total,
    u.n_spaces_total,
    u.is_owner,

    -- ── Причини виключення ────────────────────────────────────────────────
    not u.is_citizen                                                as is_employee,
    u.is_role_deactivated,
    u.is_test_only                                                  as is_test_complex_only,
    u.is_citizen and not u.is_test_only and not u.has_active_house  as is_house_deactivated,

    case
        when not u.is_citizen              then 'employee'
        when u.is_test_only                then 'test_complex'
        when u.is_role_deactivated         then 'role_deactivated'
        when not u.has_active_house        then 'house_deactivated'
    end                                                             as exclusion_reason,

    -- ЧИСТА БАЗА: мешканець, не деактивований індивідуально, має хоча б один
    -- активний будинок на цей місяць.
    u.is_citizen and not u.is_role_deactivated and u.has_active_house
                                                                    as is_active_resident,

    -- "Підтверджений" (PROD-002): активний мешканець + verified.
    u.is_citizen and not u.is_role_deactivated and u.has_active_house and u.is_verified
                                                                    as is_confirmed

from per_user_month as u
left join primary_complex as p
       on p.report_month = u.report_month
      and p.user_id      = u.user_id
left join home_complex as hc
       on hc.report_month = u.report_month
      and hc.user_id      = u.user_id
