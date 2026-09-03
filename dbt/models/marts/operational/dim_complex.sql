-- ЖК. complex_type — та сама логіка, що і в int_space_geo (назва починається з
-- "БЦ"/"ЖК"), продубльована тут навмисно: dim_complex не має space-грануляції,
-- тож рахувати через int_space_geo довелось би DISTINCT по fan-out.
-- is_test_complex — з seed test_complexes (dashboard_rebuild_plan.md 1.1: один
-- QA-комплекс, захардкожений у 2 Looker-запитах).

with complexes as (
    select * from {{ ref('stg_shared__complexes') }}
),

test_complexes as (
    select * from {{ ref('test_complexes') }}
),

go_live as (
    select * from {{ ref('complex_go_live') }}
)

select
    c.complex_id,
    c.complex_name,
    case
        when starts_with(c.complex_name, 'БЦ') then 'business_centre'
        when starts_with(c.complex_name, 'ЖК') then 'residential_complex'
        else 'other'
    end as complex_type,
    tc.complex_id is not null as is_test_complex,
    -- Місяць, з якого ЖК взагалі існує для дашборду.
    --
    -- Навіщо: спайн у мартах — це `complexes × календар`, тобто КОЖЕН ЖК
    -- отримує рядок у КОЖНОМУ місяці з 2021 року. Для ЖК, заведеного
    -- учора, це десятки місяців нулів, які читаються як «він був і нічого
    -- не робив», хоча його просто не існувало. Спіймано на «The TENTH
    -- House» (Микита 2026-09-02: «не можу зрозуміти, звідки він узявся» —
    -- ЖК завели 26.08.2026, а в дашборді він стояв з 2021-го).
    --
    -- За замовчуванням — місяць створення ЖК у CRM. Але дата заведення і
    -- дата, з якої ЖК рахують, — різні речі: «The TENTH House» завели
    -- 26.08, а рахувати домовились із вересня, бо серпень був підготовкою.
    -- Тому seed `complex_go_live` ПЕРЕКРИВАЄ created_at, а не уточнює його.
    coalesce(
        date_trunc(gl.go_live_month, month),
        date_trunc(date(c.created_at), month)
    ) as first_month,
    c.created_at,
    c.updated_at
from complexes c
left join test_complexes tc on tc.complex_id = c.complex_id
left join go_live gl on gl.complex_id = c.complex_id
