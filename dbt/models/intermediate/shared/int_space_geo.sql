-- Спільний геоланцюжок: spaces → sections → houses → complexes, з класифікацією
-- типу об'єкта (property_kind_ua) і комплексу (complex_type). Портує логіку
-- поточного finance_dash.dim_space, але як переюзовна intermediate-модель —
-- знадобиться і для product/operational dbt-моделей (Фаза 2, пізніше).
--
-- Навмисно НЕ фільтрує деактивовані будинки/виключені ЖК (house_status/
-- deactivated_at прокинуті як є) — рішення про фільтрацію приймається на
-- рівні конкретного mart'у (фінансовий дашборд історично цього не робить:
-- борг за приміщенням у деактивованому будинку — це все ще реальні гроші).

with spaces as (
    select * from {{ ref('stg_shared__spaces') }}
),

sections as (
    select * from {{ ref('stg_shared__sections') }}
),

houses as (
    select * from {{ ref('stg_shared__houses') }}
),

complexes as (
    select * from {{ ref('stg_shared__complexes') }}
),

apartments as (
    select * from {{ ref('stg_shared__space_apartments') }}
),

commercials as (
    select * from {{ ref('stg_shared__space_commercials') }}
)

select
    sp.space_id,
    sp.section_id,
    sec.house_id,
    sec.section_name,
    h.house_number,
    h.house_status,
    h.deactivated_at,
    h.complex_id,
    c.complex_name,
    case
        when starts_with(c.complex_name, 'БЦ') then 'business_centre'
        when starts_with(c.complex_name, 'ЖК') then 'residential_complex'
        else 'other'
    end as complex_type,

    sp.space_number,
    sp.floor,
    sp.kind as property_kind,
    case
        when sp.kind = 'apartment' then 'Квартира'
        when sp.kind = 'commercial' and cm.commercial_type = 'parking'   then 'Паркінг'
        when sp.kind = 'commercial' and cm.commercial_type = 'storeroom' then 'Комора'
        when sp.kind = 'commercial' then 'Комерційне'
        else sp.kind
    end as property_kind_ua,

    sp.owner_id,
    sp.cached_debt,
    ap.apartment_account_code,
    cm.commercial_type,
    cm.commercial_dabi_code,
    sp.updated_at as space_updated_at

from spaces sp
left join sections   sec on sec.section_id = sp.section_id
left join houses     h   on h.house_id     = sec.house_id
left join complexes  c   on c.complex_id   = h.complex_id
left join apartments ap  on ap.space_id    = sp.space_id
left join commercials cm on cm.space_id    = sp.space_id
