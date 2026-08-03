-- ЖК (житлові комплекси). Джерело: postgresqldim9000.complexes.

select
    id             as complex_id,
    name           as complex_name,
    description,
    payment_provider,
    created_at,
    updated_at
from {{ source('postgresqldim9000_geo', 'complexes') }}
