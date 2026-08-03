-- Банківські транзакції. Джерело: postgresqldim9000.transactions.
-- Пов'язується з operations через operations.transaction_id = transactions.id.

select
    id                              as transaction_id,
    payer_id,
    type                            as transaction_type,
    status                          as transaction_status,
    amount,
    payment_id                      as bank_payment_reference,
    payment_provider,
    checkout,
    provider_session_id,
    secondary_provider_session_id,
    created_at,
    updated_at
from {{ source('postgresqldim9000', 'transactions') }}
