-- Порт finance_dash.fact_billing. Grain: billing_id (space × service × month).

select
    bp.billing_id,
    bp.billing_month,
    bp.service_id as service_uuid,
    sv.service_type_code,
    sl.space_id,
    bp.iban,
    bp.okpo,
    bp.amount_of_charges,
    bp.paid_amount,
    bp.initial_debt,
    bp.price_to_pay,
    greatest(bp.amount_of_charges - bp.paid_amount, 0) as unpaid_charges,
    bp.is_paid,
    bp.is_preview,
    bp.synced_at,
    bp.created_at as record_created_at
from {{ ref('stg_finance__billing_payments') }} bp
left join {{ ref('stg_finance__services') }} sv
    on sv.service_id = bp.service_id
left join {{ ref('stg_finance__service_links') }} sl
    on sl.master_buh_information_id = sv.master_buh_information_id
