-- Квитанції за комунальні послуги, оплачені через застосунок. Грануляція:
-- report_month.
--
-- ⚠️ Джерело — банківські транзакції (`stg_finance__transactions`, домен
-- finance), НЕ продуктова Amplitude-подія: оплата йде через сторонній
-- платіжний шлюз, застосунок цього не бачить. Крос-доменний ref навмисний —
-- той самий прийом, що й переюз `dim_calendar_month`/`dim_complex` з
-- operational.
--
-- Формула підтверджена звіркою зі старим дашбордом (Микита, 2026-08-06):
-- transaction_type = 'utilities', статуси accepted/rejected (new —
-- незавершені спроби, ігноруємо). Липень 2026: 3 213 прийнятих / 250
-- відхилених, сума прийнятих 3 644 232,57 — точний збіг один-в-один.

with receipts as (

    select
        date_trunc(date(created_at), month)  as report_month,
        transaction_status,
        amount
    from {{ ref('stg_finance__transactions') }}
    where transaction_type = 'utilities'
      and transaction_status in ('accepted', 'rejected')

)

select
    report_month,
    format_date('%Y-%m', report_month)                                    as report_month_key,

    countif(transaction_status = 'accepted')                               as receipts_accepted,
    countif(transaction_status = 'rejected')                               as receipts_rejected,
    safe_divide(
        countif(transaction_status = 'rejected'),
        countif(transaction_status = 'accepted') + countif(transaction_status = 'rejected')
    )                                                                       as receipts_rejected_rate,

    round(sum(if(transaction_status = 'accepted', amount, 0)) / 100.0, 2)   as receipts_accepted_amount,
    round(
        safe_divide(
            sum(if(transaction_status = 'accepted', amount, 0)),
            countif(transaction_status = 'accepted')
        ) / 100.0, 2
    )                                                                       as receipts_accepted_avg_amount

from receipts
group by report_month
