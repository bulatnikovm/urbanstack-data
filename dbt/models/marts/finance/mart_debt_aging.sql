-- Порт finance_dash.mart_debt_aging. Розподіл боргу по вікових корзинах.
-- Вже на методиці Аліони в оригіналі (борг = debt_balance − paid_amount) — переносимо як є.

with current_debts as (
    select
        snapshot_month,
        space_id,
        service_type_code,
        max(complex_name)     as complex_name,
        max(llc_name)         as llc_name,
        max(iban)             as iban,
        max(building_number)  as building_number,
        max(property_kind_ua) as property_kind_ua,
        max(service_name)     as service_name,
        -- методика Аліони (мінус оплати)
        sum(debt_balance) - sum(paid_amount) as total_debt
    from {{ ref('mart_debt_flat') }}
    group by 1, 2, 3
    -- лишаємо лише позитивний нетто-борг
    having sum(debt_balance) - sum(paid_amount) > 0
),

historical_charges as (
    select
        space_id,
        service_type_code,
        billing_month,
        sum(amount_of_charges) as monthly_billed
    from {{ ref('mart_billing_flat') }}
    group by 1, 2, 3
    having sum(amount_of_charges) > 0
),

allocated_debts as (
    select
        c.snapshot_month,
        c.space_id,
        c.complex_name,
        c.llc_name,
        c.iban,
        c.building_number,
        c.property_kind_ua,
        c.service_name,
        c.total_debt,
        h.billing_month,
        coalesce(h.monthly_billed, 0) as monthly_billed,
        sum(coalesce(h.monthly_billed, 0)) over (
            partition by c.snapshot_month, c.space_id, c.service_type_code
            order by h.billing_month desc
        ) as running_total_charges,
        row_number() over (
            partition by c.snapshot_month, c.space_id, c.service_type_code
            order by h.billing_month asc
        ) as is_oldest_row
    from current_debts c
    left join historical_charges h
        on c.space_id = h.space_id
        and c.service_type_code = h.service_type_code
        -- поточний місяць не бере участі в розподілі
        and h.billing_month < c.snapshot_month
),

aged_chunks as (
    select
        *,
        case
            when billing_month is null then total_debt
            when is_oldest_row = 1 and total_debt > running_total_charges
                then monthly_billed + (total_debt - running_total_charges)
            when running_total_charges <= total_debt then monthly_billed
            when (running_total_charges - monthly_billed) < total_debt
                then total_debt - (running_total_charges - monthly_billed)
            else 0
        end as allocated_debt
    from allocated_debts
),

aged_with_buckets as (
    select
        snapshot_month,
        space_id,
        complex_name,
        llc_name,
        iban,
        building_number,
        property_kind_ua,
        service_name,
        allocated_debt,
        -- вік у МІСЯЦЯХ (не днях) — інакше "сусідній місяць" може перестрибнути корзину
        coalesce(date_diff(snapshot_month, billing_month, month), 999) as months_old
    from aged_chunks
    where allocated_debt > 0
)

select
    snapshot_month,
    complex_name,
    llc_name,
    iban,
    building_number,
    property_kind_ua,
    service_name,
    -- корзина 0-30 (поточний місяць) відсутня за побудовою (billing_month < snapshot_month)
    case
        when months_old <= 1 then '2. 31–60 днів'
        when months_old = 2  then '3. 61–90 днів'
        when months_old <= 6 then '4. 91–180 днів'
        else '5. 180+ днів'
    end as aging_bucket,
    case
        when months_old <= 1 then 2
        when months_old = 2  then 3
        when months_old <= 6 then 4
        else 5
    end as aging_sort_order,
    count(distinct space_id) as accounts_in_bucket,
    sum(allocated_debt)      as debt_in_bucket
from aged_with_buckets
group by 1, 2, 3, 4, 5, 6, 7, 8, 9
