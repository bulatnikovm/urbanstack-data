-- Місячний снапшот користувачів по ЖК. Джерело: postgresqldim9000.statistic_citizen.

select
    id              as stat_id,
    complex_id,
    year,
    month,
    total,
    citizen,
    owner,
    confirmed_user,
    unconfirmed_user,
    active_user,
    created_at,
    updated_at
from {{ source('postgresqldim9000_operational', 'statistic_citizen') }}
