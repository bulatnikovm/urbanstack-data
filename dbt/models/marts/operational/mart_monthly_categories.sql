-- Grain: complex_id × report_month × category_ua × type_ua. Замінює Стор.3
-- ("Аналітика звернень: Типи та Категорії"). "30+ днів" беклог НЕ тут — це
-- знімок поточного стану, не місячний ряд, живе в mart_house_rating (уникає
-- важкого CROSS JOIN по календарю × усі заявки, знайденого в старому Q6
-- "or_metric" — dashboard_rebuild_plan.md 1.5).

select
    complex_id,
    date_trunc(date(created_at), month) as report_month,
    category_ua,
    type_ua,
    is_valid,
    count(*) as order_count
from {{ ref('fact_orders') }}
where not coalesce(is_test_complex, false)
group by complex_id, report_month, category_ua, type_ua, is_valid
