-- Grain: user_id × space_id. Аудиторія приміщень — ВСІ мешканці:
-- власники (`spaces.owner_id`) + співмешканці/орендарі (`space_user`).
-- Заміна "Q1 user_chain" зі старих Looker-запитів.
--
-- ⚠️ ВИПРАВЛЕНО 2026-08-04. Раніше модель читала ЛИШЕ `space_user` і мовчки
-- не бачила власників — при тому, що за призначенням це «всі мешканці», а не
-- «тільки не-власники». Для буд. Всеволода Змієнка 15/23 таке визначення
-- давало 76 людей замість реальних 425 (349 власників + 76 співмешканців).
--
-- Тепер це ТОНКА ВИБІРКА над спільним `int_user_space_links` — окремої логіки
-- прив'язки тут немає, щоб не розходилась із продуктовим доменом. Ця модель
-- лишається як зручний операційний зріз (тільки мешканці, + статус виключення),
-- а не як другий підрахунок.

with links as (

    select * from {{ ref('int_user_space_links') }}
    where is_citizen

),

-- Спільний механізм виключення, зріз на поточний місяць.
exclusions as (

    select
        user_id,
        is_active_resident,
        exclusion_reason,
        is_house_deactivated
    from {{ ref('int_user_exclusions') }}
    where report_month = date_trunc(current_date(), month)

)

select
    l.user_id,
    l.space_id,
    l.house_id,
    l.complex_id,
    l.complex_name,
    l.is_test_complex,

    l.property_kind,
    l.property_kind_ua,
    l.is_owner,
    l.is_tenant,

    l.role,
    l.role = 'ROLE_CITIZEN'                 as is_active_role,
    l.is_verified                           as verified,
    l.user_created_month,

    l.house_status,
    l.house_deactivated_at,

    coalesce(e.is_active_resident, false)   as is_active_resident,
    e.exclusion_reason,
    coalesce(e.is_house_deactivated, false) as is_house_deactivated

from links as l
left join exclusions as e on e.user_id = l.user_id
