-- Grain: кампанія (campaign_id). Реєстр скоординованих звернень мешканців.
--
-- Це робочий артефакт для контуру A: керівник ЖК отримує картку —
-- дата, тема, які будинки, скільки квартир, зразок тексту. 13 із 20
-- найбільших кампаній ДОСЛІВНО вимагають письмової відповіді або акта,
-- тому дефолтна дія — одна письмова відповідь на кампанію всім учасникам.
--
-- `days_open` рахується від останньої заявки кампанії, щоб свіжі кампанії
-- було видно зверху за замовчуванням.

with parts as (
    select * from {{ ref('int_order_campaigns') }}
),

orders_raw as (
    select order_id, description
    from {{ ref('stg_dim9000__orders') }}
),

-- «представницький» текст кампанії: найдовша заявка в ній
sample as (
    select campaign_id, description as sample_text
    from (
        select
            p.campaign_id,
            o.description,
            row_number() over (
                partition by p.campaign_id order by length(o.description) desc, p.order_id
            ) as rn
        from parts p
        join orders_raw o using (order_id)
    )
    where rn = 1
)

select
    p.campaign_id,
    p.complex_id,
    any_value(p.complex_name)                                as complex_name,
    min(p.order_date)                                        as started_at,
    max(p.order_date)                                        as ended_at,
    date_diff(current_date(), max(p.order_date), day)        as days_since_last,
    date_trunc(min(p.order_date), month)                     as report_month,
    count(*)                                                 as n_orders,
    count(distinct p.citizen_id)                             as n_people,
    count(distinct p.house_id)                               as n_houses,
    string_agg(distinct p.house_number, ', ' order by p.house_number) as houses,
    any_value(p.category_ua)                                 as category_ua,
    logical_or(p.is_legal)                                   as has_legal,
    logical_or(p.is_collective)                              as has_collective,
    logical_or(p.is_osbb_intent)                             as has_osbb_intent,
    countif(p.is_escalation)                                 as n_escalation_orders,
    any_value(p.text_prefix45)                               as text_prefix45,
    any_value(s.sample_text)                                 as sample_text
from parts p
left join sample s using (campaign_id)
group by p.campaign_id, p.complex_id
