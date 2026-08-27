-- Grain: complex_id × report_month × status. Замінює Q7 ("донат статусів").
-- ⚠️ Q7 у старому Looker НЕ мав фільтра по test houses взагалі (audit 1.3) —
-- тут виключення застосовано (is_test_complex), тому сума буде іншою.

select
    complex_id,
    date_trunc(date(created_at), month) as report_month,
    status,
    is_valid,
    count(*) as order_count
from {{ ref('fact_orders') }}
where not coalesce(is_test_complex, false)
  -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
  -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
  and not is_child
group by complex_id, report_month, status, is_valid
