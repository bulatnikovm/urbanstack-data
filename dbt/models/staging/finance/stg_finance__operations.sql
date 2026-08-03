-- Платіжні операції. Джерело: postgresqldim9000.operations.
-- `browser_fingerprint` (STRUCT) навмисно виключено — не потрібен для фінансових
-- моделей, лише роздуває розмір.

select
    id                      as operation_id,
    transaction_id,
    service_payment_id      as billing_id,
    status                  as operation_status,
    amount,
    cast(commission as numeric) as commission_amount,
    paid_order_id,
    card_token_id,
    is_synced_with_provider,
    created_at,
    updated_at
from {{ source('postgresqldim9000', 'operations') }}
