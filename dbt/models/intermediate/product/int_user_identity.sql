-- Продуктова обгортка над спільним `int_user_space_links`: додає лише
-- виключення тестових ЖК (seed test_complexes) і зручні для домену імена.
-- Грануляція: user_id × house_id.
--
-- ⚠️ Q8 закрито Микитою 2026-08-04: ЖК «Форест» і БЦ «Арсенал» — це КЛІЄНТИ,
-- не тестові. Тому виключаємо лише те, що в seed'і (DIM 9000). Продуктові
-- Looker-запити виключали всі три — це була їхня помилка, не наша.
--
-- Уся логіка деактивації/виключення користувачів — у спільному
-- int_user_exclusions, тут її свідомо немає.

with links as (

    select * from {{ ref('int_user_space_links') }}

),

excluded_complexes as (

    select complex_id from {{ ref('test_complexes') }}

)

-- Спільна модель має грануляцію user × space; тут згортаємо до user × house.
select
    user_id,
    house_id,
    any_value(complex_id)                                   as complex_id,
    any_value(complex_name)                                 as complex_name,
    max(is_apartment)                                       as has_apartment,
    max(property_kind = 'commercial')                       as has_commercial,
    max(is_owner)                                           as is_owner,
    max(is_tenant)                                          as is_tenant,
    count(distinct space_id)                                as n_spaces,

    any_value(user_phone_sk)                                as user_phone_sk,
    any_value(role)                                         as role,
    max(is_verified)                                        as is_verified,
    max(is_citizen)                                         as is_citizen,
    max(is_role_deactivated)                                as is_deactivated,
    min(user_created_month)                                 as user_created_month,

    any_value(house_status)                                 as house_status,
    any_value(house_deactivated_at)                         as house_deactivated_at,
    any_value(house_created_at)                             as house_created_at,

    -- "Підтверджений" на рівні самого користувача (без урахування будинку —
    -- будинкову частину додає int_user_exclusions).
    max(is_verified) and not max(is_role_deactivated)       as is_confirmed

from links
where complex_id not in (select complex_id from excluded_complexes)
group by user_id, house_id
