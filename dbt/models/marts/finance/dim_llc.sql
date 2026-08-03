-- Порт finance_dash.dim_llc.

select
    iban,
    recipient_name as llc_name,
    merchant_id,
    cast(mfo as string) as bank_mfo,
    commission_profile_id,
    replace(replace(recipient_name, '""', '"'), '"', '') as llc_name_clean
from {{ ref('stg_finance__bank_merchants') }}
