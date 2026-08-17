-- Заявки. Джерело: postgresqldim9000.orders.

select
    id                  as order_id,
    space_id,
    citizen_id,
    created_by_id,
    citizen_id is not null
        and created_by_id = citizen_id  as is_self_authored,
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
