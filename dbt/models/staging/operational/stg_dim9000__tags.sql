-- Довідник тегів. Джерело: dim9000_fast_eu.tags (EU-дзеркало US-датасету,
-- див. коментар до source).
--
-- `type` розділяє три НЕЗАЛЕЖНІ простори тегів, які просто лежать в одній
-- таблиці: task / debtor / user. Однакових назв між ними немає, але
-- змішувати їх не можна — «Оплачено» з debtor і «Аварійна» з task не
-- належать одній шкалі.

select
    id     as tag_id,
    type   as tag_type,
    name   as tag_ua
from {{ source('dim9000_fast_eu', 'tags') }}
