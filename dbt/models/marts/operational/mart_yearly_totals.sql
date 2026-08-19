-- Grain: complex_id × report_year. Таблиця «ЖК × рік створення» на сторінці
-- SLA; компанійський тотал по року — сума по ЖК (користувач рахує її в
-- застосунку, окремої моделі під це не заводимо).
--
-- Рік фіксується по created_at (успадковано з mart_monthly_sla), НЕ по даті
-- закриття: інакше грудневі заявки, закриті в січні, переїжджають у
-- наступний рік і "створено за рік" перестає бути кількістю створеного.
--
-- in_progress = створено − виконано − скасовано в межах року. Це НЕ поточна
-- черга: заявка, створена у 2024 і закрита у 2025, тут лишиться в
-- in_progress 2024. Саме так рахував і старий дашборд — колонка відповідає
-- на питання "скільки з поданого того року не закрили того ж року".
-- Поточну живу чергу дає mart_monthly_sla.backlog_end_of_month.

select
    complex_id,
    extract(year from report_month) as report_year,
    sum(created_count)   as created_count,
    sum(completed_count) as completed_count,
    sum(canceled_count)  as canceled_count,
    sum(created_count) - sum(completed_count) - sum(canceled_count) as in_progress_count,
    safe_divide(sum(completed_count), nullif(sum(created_count), 0)) as completion_rate
from {{ ref('mart_monthly_sla') }}
group by complex_id, report_year
