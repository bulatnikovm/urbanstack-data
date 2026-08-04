-- Event log змін статусу заявки. Джерело: postgresqldim9000.history_order_updates.
-- Тільки type='transition' рядки мають надійні before/after.status (перевірено:
-- 'update' рядки — це редагування інших полів, не завжди статусу).

select
    id              as history_id,
    order_id,
    created_at      as transitioned_at,
    before.status   as status_before,
    after.status    as status_after
from {{ source('postgresqldim9000_operational', 'history_order_updates') }}
where type = 'transition'
