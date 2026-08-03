-- Порт finance_dash.mart_payment_rates_cohort.
-- is_natural тут — НОВА, канонічна методика ("формула Артема"): чи погашено
-- вхідний борг місяця X оплатами місяця X+1 (когортний підхід), а не в тому
-- самому місяці (як у mart_payment_rates.is_natural, застаріла версія).

with space_month as (
    select
        space_id,
        billing_month,
        sum(amount_of_charges) as charges,
        sum(paid_amount)       as paid,
        sum(initial_debt)      as opening_debt
    from {{ ref('fct_billing') }}
    where is_preview = false and space_id is not null
    group by 1, 2
    having sum(amount_of_charges) <> 0
),

flag as (
    select
        space_id,
        billing_month,
        paid,
        case when (opening_debt - paid) <= 0 then 1 else 0 end as is_natural
    from space_month
)

select
    c.space_id,
    c.billing_month as billing_month,
    date_add(c.billing_month, interval 1 month) as payment_month,
    s.complex_name,
    s.complex_type,
    s.property_kind_ua,
    s.building_number,

    c.charges as charges,
    n.paid    as payments,
    n.is_natural,
    case when n.is_natural = 1 then n.paid else 0 end as payment_if_natural,

    -- скільки з оплат ЦЬОГО місяця пішло понад поточне нарахування, тобто на старий борг
    greatest(c.paid - c.charges, 0) as repaid_old_debt_this_month

from space_month c
left join flag n
    on n.space_id = c.space_id
   and n.billing_month = date_add(c.billing_month, interval 1 month)
left join {{ ref('dim_space') }} s on s.space_id = c.space_id
