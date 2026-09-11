-- Зв'язок групи послуг (master_buh_service.master_buh_information_id) із конкретним
-- приміщенням (space_id). Джерело: postgresqldim9000.master_buh_information.

select
    id      as master_buh_information_id,
    space_id,
    master_buh_id,
    created_at,
    updated_at,
    -- area_comm >= area_pol у 29 253 з 29 253 ненульових пар (перевірено на
    -- BQ) — узгоджується з ANA-27 "(загальна, корисна) AREA_COMM, AREA_POL".
    safe_cast(area_comm as float64) as area_total_sqm,
    safe_cast(area_pol as float64)  as area_useful_sqm
from {{ source('postgresqldim9000', 'master_buh_information') }}
