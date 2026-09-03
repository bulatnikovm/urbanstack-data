-- Воронка по будинках, згорнута до ЖК, має збігатися з mart_user_base_monthly.
--
-- Дві вітрини рахують ОДНЕ Й ТЕ САМЕ на різних рівнях: одна по ЖК (живить
-- продуктову Стр.1), друга по будинках (живить сторінку «Підключення»). Поки
-- вони незалежні, вони рано чи пізно розійдуться — і розійдуться мовчки,
-- бо кожна окремо виглядатиме розумно. Рівно так само мовчки розходились
-- mart_monthly_tags і mart_monthly_categories, поки на них не поставили
-- такий самий тест (ANA-10).
--
-- ⚠️ Свідома розбіжність рівно одна: у будинковій вітрині немає людей із
-- house_id IS NULL. Таких не має бути взагалі (основне приміщення завжди дає
-- будинок), і якщо вони з'являться — цей тест впаде, що і треба.

with by_house as (

    select
        report_month,
        complex_id,
        sum(n_potential)    as n_potential,
        sum(n_registered)   as n_registered,
        sum(n_visitors)     as n_visitors,
        sum(n_core_active)  as n_core_active
    from {{ ref('mart_adoption_funnel_monthly') }}
    group by report_month, complex_id

),

by_complex as (

    select
        report_month,
        complex_id,
        count_potential     as n_potential,
        count_confirmed     as n_registered,
        visitors            as n_visitors,
        active_core_mau     as n_core_active
    from {{ ref('mart_user_base_monthly') }}

)

select
    coalesce(h.report_month, c.report_month) as report_month,
    coalesce(h.complex_id, c.complex_id)     as complex_id,
    h.n_potential                            as house_potential,
    c.n_potential                            as complex_potential,
    h.n_registered                           as house_registered,
    c.n_registered                           as complex_registered,
    h.n_visitors                             as house_visitors,
    c.n_visitors                             as complex_visitors,
    h.n_core_active                          as house_core_active,
    c.n_core_active                          as complex_core_active
from by_house as h
full outer join by_complex as c
    on  c.report_month = h.report_month
    and c.complex_id   = h.complex_id
where h.complex_id is null
   or c.complex_id is null
   or h.n_potential   != c.n_potential
   or h.n_registered  != c.n_registered
   or h.n_visitors    != c.n_visitors
   or h.n_core_active != c.n_core_active
