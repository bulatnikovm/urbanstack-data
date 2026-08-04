-- Будинки. house_status/deactivated_at прокинуті 1:1 з stg_shared__houses.
-- is_deactivated = status='deactivated' (надійне поле для домів, деактивованих
-- після появи цієї колонки — CLAUDE.md §9).
-- ⚠️ Відомий гап: house_id f94470ce-61a5-4454-8951-c70be8531e57 (буд.23-А) має
-- status='deactivated', але deactivated_at IS NULL у сирих даних. CLAUDE.md
-- (з посиланням на vw_dm_operations_monthly) стверджує дату деактивації
-- 2025-12-01, але тут навмисно НЕ підставляємо вигадану дату — лишаємо NULL,
-- видно з is_deactivated=true. Уточнити в Микити при першому реальному
-- розходженні в mart'ах заявок.
--
-- is_residential (≥1 квартира) — розкопано разом з Микитою: аудит-розбіжність
-- "будинків 132 (PDF) vs 110 (xlsx)" на 19 з 23 домів пояснюється окремо
-- стоячими паркінг/комерція будівлями, які технічно є "house"-записом (окрема
-- будівля), але не мають жодної квартири (напр. Севен буд."18" — 518
-- паркомісць, 0 квартир; це і є джерело загадкового хардкоду "518" з CLAUDE.md).
-- is_test_complex+is_deactivated+is_residential разом дають 106 домів проти
-- 110 у xlsx — залишок 4 не розбирали (в межах шуму).

with houses as (
    select * from {{ ref('stg_shared__houses') }}
),

complexes as (
    select * from {{ ref('dim_complex') }}
),

apartment_counts as (
    select
        house_id,
        countif(property_kind_ua = 'Квартира') as n_apartments
    from {{ ref('int_space_geo') }}
    group by house_id
)

select
    h.house_id,
    h.complex_id,
    c.complex_name,
    c.is_test_complex,
    h.house_number,
    h.house_status,
    h.house_status = 'deactivated' as is_deactivated,
    h.deactivated_at,
    coalesce(ac.n_apartments, 0) as n_apartments,
    coalesce(ac.n_apartments, 0) > 0 as is_residential,
    h.location_id,
    h.created_at,
    h.updated_at
from houses h
left join complexes c on c.complex_id = h.complex_id
left join apartment_counts ac on ac.house_id = h.house_id
