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
    c.created_at,
    c.updated_at
from complexes c
left join test_complexes tc on tc.complex_id = c.complex_id
