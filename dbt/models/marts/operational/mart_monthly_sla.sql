-- Grain: complex_id × report_month. Замінює Q3/Q4 (Стор.2 "Створено"/"Виконано").
--
-- created_count перевірено проти xlsx "Аналітична панель" (audit_operational_
-- dashboard_vs_analytical_panel.md §2.1, жовт.25→квіт.26): Δ в межах 2-6% на
-- 6 з 7 місяців (лют.26 — виняток, +16.5%, потребує окремого розбору). Це
-- набагато ближче до xlsx, ніж старий PDF-дешборд (+12-54% систематично) —
-- підтверджує, що is_valid (виключення canceled/cancelled/rejected) саме
-- та методика, яку мав на увазі xlsx.
--
-- completed_count — snapshot-логіка (МЕТ-03, рекомендація А з dashboard_
-- rebuild_plan.md: completed_at падає в місяць), НЕ event-count — уникає
-- >100% "виконання" бага зі старого event-based Q3 (МЕТ-01).

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
),

created as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        count(*) as created_count
    from orders
    where is_valid
    group by complex_id, report_month
),

completed as (
    select
        complex_id,
        date_trunc(date(completed_at), month) as report_month,
        count(*) as completed_count
    from orders
    where is_valid and completed_at is not null
    group by complex_id, report_month
),

canceled as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        count(*) as canceled_count
    from orders
    where not is_valid
    group by complex_id, report_month
)

select
    coalesce(cr.complex_id, co.complex_id, ca.complex_id) as complex_id,
    coalesce(cr.report_month, co.report_month, ca.report_month) as report_month,
    coalesce(cr.created_count, 0) as created_count,
    coalesce(co.completed_count, 0) as completed_count,
    coalesce(ca.canceled_count, 0) as canceled_count,
    safe_divide(coalesce(co.completed_count, 0), nullif(cr.created_count, 0)) as sla_rate_same_month
from created cr
full outer join completed co on co.complex_id = cr.complex_id and co.report_month = cr.report_month
full outer join canceled  ca on ca.complex_id = coalesce(cr.complex_id, co.complex_id)
                             and ca.report_month = coalesce(cr.report_month, co.report_month)
