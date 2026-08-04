-- Grain: house_id. Поточний знімок (не місячний ряд) — замінює Стор.4
-- "Антирейтинг" (навантаження П+С/ор, 30+ днів, рейтинг будинків).
--
-- Знаменник "ор" = n_apartments (dim_house, кількість квартир) — НЕ те саме,
-- що загадкові "Особові рахунки" (26 777) з аудиту, точне визначення яких не
-- знайдено (audit §3.2, "жодне не співпадає з 26 777"). Якщо Микита впізнає
-- джерело — замінити тут.
-- Беклог "30+ днів" — поріг 30 днів підтверджено Микитою (не 29).

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
),

recent as (
    select
        house_id,
        countif(is_valid) as orders_last_3m,
        countif(is_valid and type_key in ('client_problem', 'client_complaint')) as problem_complaint_last_3m
    from orders
    where created_at >= timestamp_sub(current_timestamp(), interval 90 day)
    group by house_id
),

backlog as (
    select
        house_id,
        countif(is_valid and not is_resolved and date_diff(current_date(), date(created_at), day) >= 30) as backlog_30d
    from orders
    group by house_id
),

houses as (
    select * from {{ ref('dim_house') }}
    where not is_test_complex and is_residential and not is_deactivated
)

select
    h.house_id,
    h.complex_id,
    h.complex_name,
    h.house_number,
    h.n_apartments,
    coalesce(r.orders_last_3m, 0) as orders_last_3m,
    coalesce(r.problem_complaint_last_3m, 0) as problem_complaint_last_3m,
    safe_divide(coalesce(r.problem_complaint_last_3m, 0), nullif(h.n_apartments, 0)) as problem_complaint_rate,
    coalesce(b.backlog_30d, 0) as backlog_30d
from houses h
left join recent  r on r.house_id = h.house_id
left join backlog b on b.house_id = h.house_id
