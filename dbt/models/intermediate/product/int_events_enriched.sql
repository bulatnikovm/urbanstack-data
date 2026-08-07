-- Події + каталог подій (seed) + користувач CRM. Грануляція: подія.
--
-- Тут закривається головна структурна проблема домену: класифікація події
-- (модуль / core / STAR-категорія / активація) береться ВИКЛЮЧНО з seed
-- product_event_catalog, а не з CASE, скопійованого по запитах. У Looker таких
-- CASE було 4 різних списки core-подій і 2 розбіжні мапінги модулів.
--
-- ⚠️ Юзер може бути прив'язаний до кількох ЖК. Щоб не множити події, беремо
-- ОДИН ЖК на користувача (найраніший за user_created_date, детермінованим
-- порядком). Для розрізів "по ЖК" це наближення — точний розріз рахується в
-- int_user_identity на рівні користувачів, а не подій.

with events as (

    select * from {{ ref('stg_amplitude__events') }}

),

catalog as (

    select * from {{ ref('product_event_catalog') }}

),

identity_single as (

    select
        user_phone_sk,
        user_id,
        complex_id,
        is_verified,
        is_deactivated,
        is_confirmed,
        user_created_month
    from {{ ref('int_user_identity') }}
    where user_phone_sk is not null
    qualify row_number() over (
        partition by user_phone_sk
        order by user_created_month, complex_id
    ) = 1

)

select
    e.event_uuid,
    e.event_time,
    e.event_date,
    e.event_week,
    e.event_month,
    e.event_type,
    e.device_id,
    e.session_id,
    e.user_phone_sk,
    e.is_authenticated,
    e.os_type,
    e.app_version,

    c.module_code,
    c.is_technical,
    c.is_core_event,
    c.star_category,
    c.is_success_action,
    c.is_activation_event,
    c.is_value_action,

    i.user_id,
    i.complex_id,
    coalesce(i.is_confirmed, false)     as is_confirmed_user,
    i.user_created_month,

    -- Подія від відомого CRM-користувача (а не гість/до-авторизаційний трафік).
    i.user_id is not null               as is_known_user

from events as e
left join catalog as c on c.event_type = e.event_type
left join identity_single as i on i.user_phone_sk = e.user_phone_sk
