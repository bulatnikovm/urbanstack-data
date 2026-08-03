-- Сирий білінговий запис: нарахування/оплата/вхідний борг за послугу за місяць.
-- Джерело: postgresqldim9000.master_buh_service_payment (Stitch-sync).
-- Грошові суми в джерелі — STRING, тут приводимо до NUMERIC. Без бізнес-логіки
-- (debt_bucket/is_debtor рахуються далі, у fct_debt).

select
    id                              as billing_id,
    safe.parse_date('%Y%m', period) as billing_month,
    service_id                      as service_id,      -- FK -> stg_finance__services.service_id
    iban,
    okpo,
    cast(amount_of_charges as numeric) as amount_of_charges,
    cast(paid_amount       as numeric) as paid_amount,
    cast(initial_debt      as numeric) as initial_debt,
    cast(price_to_pay      as numeric) as price_to_pay,
    cast(desired_amount    as numeric) as desired_amount,
    is_paid,
    is_preview,
    created_at,
    updated_at,
    synced_at
from {{ source('postgresqldim9000', 'master_buh_service_payment') }}
