-- Порт finance_dash.fact_debt. Grain: billing_id (= один знімок боргу на місяць,
-- бо billing_month уже "вшитий" у сирий рядок msp.period).
-- debt_balance/is_debtor/debt_bucket тут — СТАРА (raw initial_debt) методика,
-- 1:1 як у продакшн-fact. Нова (методика Аліони) рахується вище за течією,
-- у mart_debt_alena/mart_debt_aging/mart_debt_years — див. коментарі там.

select
    bp.billing_id,
    bp.billing_month as snapshot_month,
    last_day(bp.billing_month) as snapshot_month_end,
    bp.service_id as service_uuid,
    sv.service_type_code,
    sl.space_id,
    bp.iban,
    bp.okpo,
    bp.initial_debt as debt_balance,
    bp.amount_of_charges as current_month_charges,
    bp.paid_amount,
    greatest(bp.initial_debt - bp.amount_of_charges, 0) as prior_debt_carryover,
    bp.initial_debt > 0 as is_debtor,
    case
        when bp.initial_debt <= 0    then 'no_debt'
        when bp.initial_debt <= 1000 then '≤1000'
        else '>1000'
    end as debt_bucket,
    bp.is_preview,
    bp.synced_at
from {{ ref('stg_finance__billing_payments') }} bp
left join {{ ref('stg_finance__services') }} sv
    on sv.service_id = bp.service_id
left join {{ ref('stg_finance__service_links') }} sl
    on sl.master_buh_information_id = sv.master_buh_information_id
where bp.amount_of_charges > 0 or bp.initial_debt > 0
