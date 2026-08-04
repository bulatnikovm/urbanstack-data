-- Grain: report_year (компанія загалом, без розбивки по ЖК — так само, як
-- порівняльна таблиця в audit_operational_dashboard_vs_analytical_panel.md §2.2).
-- created_count фіксовано по року created_at (НЕ completed_at — стара Q13-помилка
-- переносила грудневі заявки в наступний рік, якщо їх закрили пізніше).

select
    extract(year from report_month) as report_year,
    sum(created_count) as created_count,
    sum(completed_count) as completed_count,
    sum(canceled_count) as canceled_count
from {{ ref('mart_monthly_sla') }}
group by report_year
