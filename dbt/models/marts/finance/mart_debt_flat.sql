-- Порт finance_dash.mart_debt_flat.
-- Навмисно зберігає ОБИДВІ методики боргу поруч для перехідного порівняння:
--   total_debt         — стара ("flat"/initial_debt), FIN-003
--   overdue_debt_alena — нова методика Аліони (debt_balance − current_month_charges), FIN-004

select
    fd.billing_id,
    fd.snapshot_month,
    fd.snapshot_month_end,
    fd.debt_balance,
    fd.paid_amount,
    fd.prior_debt_carryover,
    fd.is_debtor,
    fd.debt_bucket,
    fd.space_id,
    fd.okpo,
    fd.service_type_code,
    fd.synced_at,

    s.personal_account,
    s.space_number,
    s.property_kind,
    s.property_kind_ua,
    s.complex_name,
    s.building_number,
    s.complex_type,

    fd.prior_debt_carryover  as overdue_debt_on_1st,
    fd.current_month_charges as current_month_charges,
    fd.debt_balance          as total_debt,

    (fd.debt_balance - fd.current_month_charges) as overdue_debt_alena,

    coalesce(l.llc_name_clean, 'Невідоме ТОВ') as llc_name,
    coalesce(sv.service_name, 'Невідома послуга') as service_name,
    fd.iban

from {{ ref('fct_debt') }} fd
left join {{ ref('dim_space') }} s    on s.space_id = fd.space_id
left join {{ ref('dim_llc') }} l      on l.iban = fd.iban
left join {{ ref('dim_service') }} sv on sv.service_type_code = fd.service_type_code
where fd.is_preview = false
  and fd.debt_balance >= 0.01
