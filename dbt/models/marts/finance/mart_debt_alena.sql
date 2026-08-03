-- Порт finance_dash.mart_debt_alena. Канонічна net-методика боргу (FIN-004):
-- overdue_debt = SUM(debt_balance) - SUM(paid_amount), агреговано по space×month.

with per_space as (
    select
        fd.space_id,
        fd.snapshot_month,
        sum(fd.debt_balance) as saldo_poch,
        sum(fd.paid_amount)  as paid,
        sum(fd.debt_balance) - sum(fd.paid_amount) as overdue_debt,
        sum(fd.current_month_charges) as current_month_charges,
        max(fd.iban) as iban
    from {{ ref('fct_debt') }} fd
    where fd.is_preview = false
    group by fd.space_id, fd.snapshot_month
)

select
    ps.space_id,
    ps.snapshot_month,
    ps.saldo_poch,
    ps.paid,
    ps.overdue_debt,

    case when ps.overdue_debt > 0 then 1 else 0 end as is_debtor,
    case when ps.overdue_debt < 0 then 1 else 0 end as is_overpaid,

    case
        when ps.overdue_debt <= 0    then 'no_debt'
        when ps.overdue_debt <= 1000 then '≤1000'
        else '>1000'
    end as debt_bucket,

    s.complex_name,
    s.complex_type,
    s.building_number,
    s.property_kind_ua,
    s.personal_account,
    s.space_number,
    coalesce(l.llc_name_clean, 'Невідоме ТОВ') as llc_name,

    ps.current_month_charges

from per_space ps
left join {{ ref('dim_space') }} s on s.space_id = ps.space_id
left join {{ ref('dim_llc') }} l   on l.iban = ps.iban
