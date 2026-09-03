-- СКВОЗНА ВОРОНКА ПРИЙНЯТТЯ. Грануляція: report_month × house_id.
--
-- Та сама логіка, що в mart_user_base_monthly, опущена на рівень БУДИНКУ:
--   є особовий рахунок → зареєструвався → заходив у місяці → зробив цільову дію
--
-- Кожен користувач рахується РІВНО ОДИН РАЗ і потрапляє рівно в один будинок
-- (основне приміщення: житло важливіше за комерцію/паркінг, далі найстаріший
-- будинок), тому суму по будинках можна згортати до ЖК і до тоталу. На це
-- стоїть тест assert_house_funnel_matches_complex — він щоночі звіряє згортку
-- з mart_user_base_monthly. Дві вітрини з тією самою логікою, що розходяться
-- мовчки, — рівно той клас багу, від якого ми тікаємо.
--
-- mart_user_base_monthly НЕ чіпаємо: на ньому висить продуктова Стр.1.
--
-- ⚠️ Тут, на відміну від mart_adoption_house_monthly, обмеження «від 2024-01»
-- НЕМАЄ: накопичені непідключені — це вся історія, і питання «скільки людей
-- у цьому будинку так і не дійшли до застосунку» не має вікна.

with base as (

    select * from {{ ref('int_user_base_monthly') }}
    where is_active_resident
      and house_id is not null

),

base_agg as (

    select
        report_month,
        house_id,
        count(distinct user_id)                                     as n_potential,
        count(distinct if(is_confirmed, user_id, null))              as n_registered
    from base
    group by report_month, house_id

),

-- Активність прив'язуємо до будинку через базу ТОГО САМОГО місяця, як і в
-- mart_user_base_monthly: людина могла переїхати, і подія має рахуватись там,
-- де вона жила в цьому місяці.
activity as (

    select
        a.event_month                                   as report_month,
        b.house_id,
        a.user_phone_sk,
        a.is_core_active
    from {{ ref('int_user_monthly_activity') }} as a
    inner join base as b
            on b.user_phone_sk = a.user_phone_sk
           and b.report_month  = a.event_month

),

activity_agg as (

    select
        report_month,
        house_id,
        count(distinct user_phone_sk)                               as n_visitors,
        count(distinct if(is_core_active, user_phone_sk, null))     as n_core_active
    from activity
    group by report_month, house_id

),

houses as (

    select
        house_id,
        house_address,
        complex_id,
        complex_name,
        created_at                                                  as house_opened_at
    from {{ ref('dim_house') }}

)

select
    b.report_month,
    format_date('%Y-%m', b.report_month)                            as report_month_key,
    b.house_id,
    h.house_address,
    h.complex_id,
    h.complex_name,
    date(h.house_opened_at)                                         as house_opened_date,

    b.n_potential,
    b.n_registered,
    coalesce(a.n_visitors, 0)                                       as n_visitors,
    coalesce(a.n_core_active, 0)                                    as n_core_active,

    -- Накопичені непідключені — головна цифра сторінки. Лічильник, а не
    -- частка: складати його по будинках можна, частку — ні.
    b.n_potential - b.n_registered                                  as n_never_registered

from base_agg as b
left join activity_agg as a
       on a.report_month = b.report_month
      and a.house_id     = b.house_id
inner join houses as h on h.house_id = b.house_id
