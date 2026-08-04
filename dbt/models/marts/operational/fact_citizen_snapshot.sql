-- Grain: complex_id × report_month. Джерело: statistic_citizen — вже готовий
-- місячний снапшот (не рахуємо самі, довіряємо джерелу).

with stats as (
    select * from {{ ref('stg_dim9000__statistic_citizen') }}
),

complexes as (
    select * from {{ ref('dim_complex') }}
)

select
    s.stat_id,
    s.complex_id,
    c.complex_name,
    c.is_test_complex,
    date(s.year, s.month, 1) as report_month,
    s.total,
    s.citizen,
    s.owner,
    s.confirmed_user,
    s.unconfirmed_user,
    s.active_user
from stats s
left join complexes c on c.complex_id = s.complex_id
