-- Заявки. Джерело: postgresqldim9000.orders.

select
    id                  as order_id,
    space_id,
    citizen_id,
    category,
    type,
    status,
    cancellation_reason,
    parent_id           as parent_order_id,
    created_at,
    updated_at,
    completed_at,
    deadline,
    planned_deadline,
    description
from {{ source('postgresqldim9000_operational', 'orders') }}
