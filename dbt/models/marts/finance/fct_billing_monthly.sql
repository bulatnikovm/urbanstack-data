-- Головний факт для payment scoring: грануляція приміщення (space) × місяць.
-- Агрегує білінг/оплати/борг (ОБИДВІ методики) з дрібнішого рівня
-- space×service×month до одного рядка на приміщення на місяць — саме та
-- гранулярність, яка потрібна для тренування моделі.
--
-- Чистий факт (агрегація), без ML-фіч (лагів/z-скорів тощо) — це лишається
-- на стороні Python/notebook.

with monthly_billing as (
    select
        space_id,
        billing_month,
        sum(amount_of_charges) as total_charges,
        sum(paid_amount)       as total_paid
    from {{ ref('fct_billing') }}
    where is_preview = false
        and space_id is not null
        and billing_month is not null
    group by 1, 2
),

monthly_debt_legacy as (
    -- стара методика (сирий debt_balance, FIN-003), просумована по всіх
    -- послугах приміщення за місяць
    select
        space_id,
        snapshot_month as billing_month,
        sum(debt_balance) as debt_balance_legacy
    from {{ ref('fct_debt') }}
    where is_preview = false
    group by 1, 2
),

natural_same_month as (
    -- FIN-006, стара методика (mart_payment_rates) — уже на грануляції space×month,
    -- distinct прибирає дублі по послугах
    select distinct
        space_id,
        billing_month,
        is_natural as is_natural_same_month
    from {{ ref('mart_payment_rates') }}
),

natural_cohort as (
    -- FIN-006, "формула Артема" (mart_payment_rates_cohort) — канонічна методика
    select distinct
        space_id,
        billing_month,
        is_natural as is_natural_cohort,
        repaid_old_debt_this_month
    from {{ ref('mart_payment_rates_cohort') }}
)

select
    mb.space_id,
    mb.billing_month,

    s.complex_name,
    s.building_number,
    s.property_kind_ua,

    mb.total_charges,
    mb.total_paid,

    -- стара методика боргу (FIN-003)
    coalesce(dl.debt_balance_legacy, 0) as debt_balance_legacy,
    case
        when coalesce(dl.debt_balance_legacy, 0) <= 0    then 'no_debt'
        when coalesce(dl.debt_balance_legacy, 0) <= 1000 then '≤1000'
        else '>1000'
    end as debt_bucket_legacy,

    -- нова методика Аліони (FIN-004) — переюзовуємо вже звірений mart_debt_alena
    coalesce(da.overdue_debt, 0) as overdue_debt_alena,
    coalesce(da.is_debtor, 0)    as is_debtor_alena,
    da.debt_bucket               as debt_bucket_alena,

    -- природність оплат — обидві версії (FIN-006)
    ns.is_natural_same_month,
    nc.is_natural_cohort,
    nc.repaid_old_debt_this_month

from monthly_billing mb
left join monthly_debt_legacy dl
    on dl.space_id = mb.space_id and dl.billing_month = mb.billing_month
left join {{ ref('mart_debt_alena') }} da
    on da.space_id = mb.space_id and da.snapshot_month = mb.billing_month
left join natural_same_month ns
    on ns.space_id = mb.space_id and ns.billing_month = mb.billing_month
left join natural_cohort nc
    on nc.space_id = mb.space_id and nc.billing_month = mb.billing_month
left join {{ ref('dim_space') }} s
    on s.space_id = mb.space_id
