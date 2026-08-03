-- Порт finance_dash.mart_billing_flat.

select
    f.billing_id,
    f.billing_month,
    f.amount_of_charges,
    f.paid_amount,
    f.unpaid_charges,
    f.initial_debt,
    f.price_to_pay,
    f.is_paid,
    f.synced_at,
    f.record_created_at,
    f.space_id,

    coalesce(s.complex_name,    'Невідомий ЖК')      as complex_name,
    coalesce(s.building_number, 'Невідомий будинок')  as building_number,
    s.section_name,
    s.space_number,

    coalesce(s.property_kind_ua, 'Тип не вказано') as property_kind_ua,
    s.property_kind,
    s.complex_type,

    s.personal_account,
    s.apartment_account_code,

    f.iban,
    coalesce(l.llc_name_clean, 'Невідоме ТОВ') as llc_name,
    f.okpo,
    f.service_type_code,
    coalesce(sv.service_name, 'Невідома послуга') as service_name

from {{ ref('fct_billing') }} f
left join {{ ref('dim_space') }} s  on s.space_id = f.space_id
left join {{ ref('dim_llc') }} l    on l.iban = f.iban
left join {{ ref('dim_service') }} sv on sv.service_type_code = f.service_type_code
where f.is_preview = false
