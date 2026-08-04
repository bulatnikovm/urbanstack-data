-- Grain: complex_id × report_month. Замінює Q1/Q2/Q5 (Стор.1: топ-KPI +
-- основна таблиця). Головна знахідка розбіжності "будинків 132 vs 110"
-- (audit §1) — див. dim_house.is_residential.
--
-- Все POINT-IN-TIME на deactivated_at конкретного місяця (не поточний
-- статус) — і n_houses_active, і n_apartments/n_parking/n_commercial.
-- ⚠️ Друга ітерація цієї моделі рахувала приміщення СТАТИЧНО (поточний стан
-- int_space_geo, ігноруючи deactivated_at) — це завищувало n_apartments,
-- бо квартири деактивованих будинків Севену (виїхали з УК) продовжували
-- рахуватись як поточний інвентар. Виправлено: приміщення тепер належать
-- тому ж point-in-time фільтру, що й будинки.
--
-- Грануляція веде від complex_months (complex × усі місяці календаря), НЕ від
-- house-присутності — інакше комплекс без жодного активного residential-
-- будинку в місяці (Севен, деактивований 2025-08→10) просто зникає з mart'у
-- разом з реальними n_parking (паркінг-будинок Севену НЕ деактивований).

with calendar as (
    select * from {{ ref('dim_calendar_month') }}
),

complexes as (
    select * from {{ ref('dim_complex') }} where not is_test_complex
),

complex_months as (
    select c.complex_id, cal.report_month
    from complexes c
    cross join calendar cal
),

houses as (
    select * from {{ ref('dim_house') }} where not is_test_complex
),

active_houses_by_month as (
    select
        h.house_id,
        h.complex_id,
        h.is_residential,
        cal.report_month
    from houses h
    cross join calendar cal
    where h.created_at < timestamp(date_add(cal.report_month, interval 1 month))
      and (h.deactivated_at is null or h.deactivated_at >= timestamp(cal.report_month))
),

house_months_agg as (
    select
        complex_id,
        report_month,
        countif(is_residential) as n_houses_active
    from active_houses_by_month
    group by complex_id, report_month
),

space_counts as (
    select
        ah.complex_id,
        ah.report_month,
        countif(g.property_kind_ua = 'Квартира')    as n_apartments,
        countif(g.property_kind_ua = 'Паркінг')      as n_parking,
        countif(g.property_kind_ua = 'Комерційне')   as n_commercial,
        countif(g.property_kind_ua = 'Комора')       as n_storeroom
    from active_houses_by_month ah
    left join {{ ref('int_space_geo') }} g on g.house_id = ah.house_id
    group by ah.complex_id, ah.report_month
),

-- "Особові рахунки" з аудиту (26 777, без розгадки) — розкопано разом з
-- Микитою: master_buh_id в master_buh_information/stg_finance__service_links.
-- Поточний (не point-in-time) підрахунок по non-test/non-deactivated будинках
-- дав 26 412 — в межах 1.4% від загадкового числа, достатньо для впевненості
-- у визначенні. Тут — теж point-in-time, як і решта mart'у.
billing_accounts as (
    select
        ah.complex_id,
        ah.report_month,
        count(distinct sl.master_buh_id) as n_billing_accounts
    from active_houses_by_month ah
    join {{ ref('int_space_geo') }} g on g.house_id = ah.house_id
    join {{ ref('stg_finance__service_links') }} sl
        on sl.space_id = g.space_id
        and sl.created_at < timestamp(date_add(ah.report_month, interval 1 month))
    group by ah.complex_id, ah.report_month
),

citizens as (
    select * from {{ ref('fact_citizen_snapshot') }} where not is_test_complex
),

sla as (
    select * from {{ ref('mart_monthly_sla') }}
)

select
    cm.complex_id,
    c.complex_name,
    cm.report_month,
    coalesce(hm.n_houses_active, 0)  as n_houses_active,
    coalesce(sc.n_apartments, 0)     as n_apartments,
    coalesce(sc.n_parking, 0)        as n_parking,
    coalesce(sc.n_commercial, 0)     as n_commercial,
    coalesce(sc.n_storeroom, 0)      as n_storeroom,
    coalesce(ba.n_billing_accounts, 0) as n_billing_accounts,
    cs.total                         as n_users_total,
    cs.confirmed_user                as n_users_confirmed,
    cs.unconfirmed_user              as n_users_unconfirmed,
    cs.active_user                   as n_users_active,
    cs.owner                         as n_owners,
    sla.created_count,
    sla.completed_count,
    sla.canceled_count
from complex_months cm
left join complexes c on c.complex_id = cm.complex_id
left join house_months_agg hm on hm.complex_id = cm.complex_id and hm.report_month = cm.report_month
left join space_counts sc on sc.complex_id = cm.complex_id and sc.report_month = cm.report_month
left join billing_accounts ba on ba.complex_id = cm.complex_id and ba.report_month = cm.report_month
left join citizens cs on cs.complex_id = cm.complex_id and cs.report_month = cm.report_month
left join sla on sla.complex_id = cm.complex_id and sla.report_month = cm.report_month
