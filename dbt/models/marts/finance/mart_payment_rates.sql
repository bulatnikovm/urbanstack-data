-- Порт finance_dash.mart_payment_rates.
-- is_natural тут — СТАРА методика (погашення в тому ж місяці). У продакшн-коді
-- пряма вказівка з часом перевести на когортну "формулу Артема" —
-- див. mart_payment_rates_cohort.is_natural (нова, канонічна).

with space_flag as (
    select
        f.space_id,
        f.billing_month,
        case when sum(f.initial_debt) - sum(f.paid_amount) <= 0
             then 1 else 0
        end as is_natural
    from {{ ref('fct_billing') }} f
    where f.is_preview = false
        and f.billing_month is not null
        and f.space_id is not null
    group by f.space_id, f.billing_month
    having sum(f.amount_of_charges) > 0
)

select
    f.space_id,
    f.billing_month,
    s.complex_name,
    s.complex_type,
    s.property_kind_ua,
    s.building_number,
    coalesce(l.llc_name_clean, 'Невідоме ТОВ')    as llc_name,
    coalesce(sv.service_name, 'Невідома послуга') as service_name,

    f.amount_of_charges as charges,
    f.paid_amount       as payments,

    sf.is_natural,

    case when sf.is_natural = 1
         then f.paid_amount else 0
    end as payment_if_natural,

    -- legacy-поле для зворотної сумісності; канонічна метрика природності —
    -- mart_payment_rates_cohort.is_natural
    case when f.paid_amount >= f.amount_of_charges
         then f.amount_of_charges
         else f.paid_amount
    end as payment_for_current

from {{ ref('fct_billing') }} f
inner join space_flag sf
    on sf.space_id = f.space_id and sf.billing_month = f.billing_month
left join {{ ref('dim_space') }} s    on s.space_id = f.space_id
left join {{ ref('dim_llc') }} l      on l.iban = f.iban
left join {{ ref('dim_service') }} sv on sv.service_type_code = f.service_type_code
where f.is_preview = false
    and f.billing_month is not null
    and f.space_id is not null
