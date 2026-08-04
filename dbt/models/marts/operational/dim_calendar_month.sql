-- Календарний спайн по місяцях, 2021-01 → поточний місяць (замінює
-- GENERATE_DATE_ARRAY inline у 6 старих Looker-запитах — dashboard_rebuild_plan.md 2.1).

with spine as (
    {{ dbt_utils.date_spine(
        datepart="month",
        start_date="cast('2021-01-01' as date)",
        end_date="date_trunc(current_date(), month) + interval 1 month"
    ) }}
)

select
    date_month as report_month,
    extract(year from date_month) as report_year,
    format_date('%Y-%m', date_month) as report_month_key
from spine
