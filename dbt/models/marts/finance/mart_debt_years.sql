-- Порт finance_dash.mart_debt_years, З ФІКСОМ (Фаза 1, looker_extracted/financial/AUDIT.md):
-- оригінал рахував current_debts.total_debt як сирий SUM(debt_balance), без вирахування
-- paid_amount — на відміну від майже ідентичного mart_debt_aging, який уже на методиці
-- Аліони. Тут виправлено: SUM(debt_balance) - SUM(paid_amount), щоб обидва "aging"-view
-- рахували від однієї й тієї самої цифри боргу.

with current_debts as (
    select
        space_id,
        service_type_code,
        max(complex_name)    as complex_name,
        max(llc_name)        as llc_name,
        max(building_number) as building_number,
        -- ФІКС: методика Аліони (мінус оплати), вирівняно з mart_debt_aging
        sum(debt_balance) - sum(paid_amount) as total_debt
    from {{ ref('mart_debt_flat') }}
    where snapshot_month = (select max(snapshot_month) from {{ ref('mart_debt_flat') }})
    group by 1, 2
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
        c.space_id,
        c.complex_name,
        c.llc_name,
        c.building_number,
        c.total_debt,
        h.billing_month,
        coalesce(h.monthly_billed, 0) as monthly_billed,
        sum(coalesce(h.monthly_billed, 0)) over (
            partition by c.space_id, c.service_type_code
            order by h.billing_month desc
        ) as running_total_charges,
        row_number() over (
            partition by c.space_id, c.service_type_code
            order by h.billing_month asc
        ) as is_oldest_row,
        coalesce(
            date_diff(
                last_day((select max(snapshot_month) from {{ ref('mart_debt_flat') }})),
                billing_month,
                day
            ),
            999
        ) as age_days
    from current_debts c
    left join historical_charges h
        on c.space_id = h.space_id
        and c.service_type_code = h.service_type_code
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
)

select
    complex_name,
    llc_name,
    building_number,
    coalesce(cast(extract(year from billing_month) as string), 'Без історії') as debt_year,
    sum(allocated_debt) as debt_amount
from aged_chunks
where allocated_debt > 0
  and age_days > 30   -- виключаємо 0-30 днів (поточний місяць)
group by 1, 2, 3, 4
