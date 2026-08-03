-- Порт finance_dash.fact_payments. Grain: operation_id.

select
    op.operation_id,
    op.transaction_id,
    op.billing_id,
    date(op.created_at, 'Europe/Kiev') as payment_date,
    date_trunc(date(op.created_at, 'Europe/Kiev'), month) as payment_month,
    tx.payer_id,
    op.amount / 100.0 as payment_amount,
    op.commission_amount,
    tx.payment_provider,
    tx.transaction_type,
    tx.bank_payment_reference,
    op.operation_status,
    tx.transaction_status
from {{ ref('stg_finance__operations') }} op
join {{ ref('stg_finance__transactions') }} tx
    on tx.transaction_id = op.transaction_id
where op.operation_status = 'accepted'
  and tx.transaction_status = 'accepted'
  and op.paid_order_id is null
