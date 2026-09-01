-- Кожна заявка присутня в mart_monthly_tags РІВНО ОДИН раз.
--
-- Це головна властивість моделі, і саме її не було, поки виміром був окремий
-- тег: заявка з двома мітками давала два рядки, зріз по тегах виходив
-- більшим за загальну цифру, а виключення тега не прибирало заявку (ANA-10).
--
-- Перевіряємо згорткою до спільної грануляції з mart_monthly_categories:
-- набір тегів — єдина відмінність між моделями, тож після його згортання
-- лічильники мають збігтись до останньої заявки.

with tags as (
    select
        complex_id, report_month, category_ua, type_ua,
        sum(created_count)               as created_count,
        sum(valid_created_count)         as valid_created_count,
        sum(completed_count)             as completed_count,
        sum(canceled_count)              as canceled_count,
        sum(completed_same_month_count)  as completed_same_month_count
    from {{ ref('mart_monthly_tags') }}
    group by 1, 2, 3, 4
),

cats as (
    select * from {{ ref('mart_monthly_categories') }}
)

select
    coalesce(t.complex_id, c.complex_id)     as complex_id,
    coalesce(t.report_month, c.report_month) as report_month,
    coalesce(t.category_ua, c.category_ua)   as category_ua,
    coalesce(t.type_ua, c.type_ua)           as type_ua,
    t.created_count   as tags_created,
    c.created_count   as cats_created
from tags t
full outer join cats c
  on  c.complex_id   = t.complex_id
  and c.report_month = t.report_month
  and c.category_ua  = t.category_ua
  and c.type_ua      = t.type_ua
where t.complex_id is null
   or c.complex_id is null
   or t.created_count              != c.created_count
   or t.valid_created_count        != c.valid_created_count
   or t.completed_count            != c.completed_count
   or t.canceled_count             != c.canceled_count
   or t.completed_same_month_count != c.completed_same_month_count
