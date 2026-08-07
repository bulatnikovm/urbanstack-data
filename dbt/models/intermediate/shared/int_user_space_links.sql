-- Спільний зв'язок КОРИСТУВАЧ ↔ ПРИМІЩЕННЯ. Грануляція: user_id × space_id —
-- це АТОМАРНИЙ рівень зв'язку, усе інше (будинок, ЖК) агрегується з нього.
-- Переюзовна обома доменами, як int_space_geo для гео.
--
-- Об'єднує ДВА способи прив'язки, які в старих запитах постійно плутали:
--   * власник   — `spaces.owner_id`
--   * мешканець — `space_user.user_id`
-- Рахувати аудиторію лише по `space_user` — груба помилка: для буд. Всеволода
-- Змієнка 15/23 це давало 76 людей замість реальних 425 (349 власників +
-- 76 співмешканців).
--
-- Навмисно НЕ фільтрує деактивованих — це робить int_user_exclusions.
-- Тут лише факти: хто, де, яка роль, коли будинок деактивовано.

with geo as (

    select * from {{ ref('int_space_geo') }}
    where property_kind in ('apartment', 'commercial')

),

owners as (

    select
        owner_id        as user_id,
        space_id,
        true            as is_owner
    from geo
    where owner_id is not null

),

tenants as (

    select
        su.user_id,
        su.space_id,
        false           as is_owner
    from {{ ref('stg_dim9000__space_user') }} as su
    inner join geo on geo.space_id = su.space_id

),

links as (

    select
        user_id,
        space_id,
        max(is_owner)       as is_owner,
        max(not is_owner)   as is_tenant
    from (
        select * from owners
        union all
        select * from tenants
    )
    group by user_id, space_id

),

users as (

    select * from {{ ref('stg_dim9000__users') }}

),

houses as (

    select * from {{ ref('stg_shared__houses') }}

),

test_complexes as (

    select complex_id from {{ ref('test_complexes') }}

)

select
    l.user_id,
    l.space_id,
    g.house_id,
    g.complex_id,
    g.complex_name,
    g.complex_id in (select complex_id from test_complexes)  as is_test_complex,

    g.property_kind,
    g.property_kind_ua,
    g.property_kind = 'apartment'                           as is_apartment,
    l.is_owner,
    l.is_tenant,

    u.role,
    u.verified                                              as is_verified,
    u.user_phone_sk,
    date_trunc(date(u.created_at), month)                   as user_created_month,

    -- Мешканець (не співробітник УК).
    u.role like '%CITIZEN%'                                 as is_citizen,
    -- Індивідуальна деактивація користувача (з'їхав / видалили акаунт).
    u.role = 'ROLE_INACTIVATED_CITIZEN'                     as is_role_deactivated,

    h.house_status,
    h.deactivated_at                                        as house_deactivated_at,
    date_trunc(date(h.deactivated_at), month)               as house_deactivated_month,
    h.created_at                                            as house_created_at

from links as l
inner join geo as g    on g.space_id = l.space_id
inner join users as u  on u.user_id  = l.user_id
inner join houses as h on h.house_id = g.house_id
