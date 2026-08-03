-- Порт finance_dash.mart_payments_flat.

select
    fp.operation_id,
    fp.transaction_id,
    fp.billing_id,
    fp.payment_date,
    fp.payment_month,
    fb.billing_month,
    fp.payment_amount,
    fp.commission_amount,
    fp.payment_provider,
    fp.transaction_type,
    fp.bank_payment_reference,
    coalesce(s.complex_name, 'Невідомий ЖК') as complex_name,
    coalesce(s.building_number, 'Невідомий будинок') as building_number,

    case
        when s.property_kind = 'apartment'  then 'Квартира'
        when s.property_kind = 'commercial' then 'Комерція'
        when s.property_kind = 'parking'    then 'Паркінг'
        else 'Тип не вказано'
    end as property_kind_ua,

    s.complex_type,
    fb.iban,
    coalesce(l.llc_name_clean, 'Невідоме ТОВ') as llc_name,
    fb.service_type_code,
    coalesce(sv.service_name, 'Невідома послуга') as service_name,
    fb.amount_of_charges

from {{ ref('fct_payments') }} fp
left join {{ ref('fct_billing') }} fb on fb.billing_id = fp.billing_id
left join {{ ref('dim_space') }} s    on s.space_id = fb.space_id
left join {{ ref('dim_llc') }} l      on l.iban = fb.iban
left join {{ ref('dim_service') }} sv on sv.service_type_code = fb.service_type_code
where fb.is_preview = false
