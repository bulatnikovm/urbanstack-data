-- Зв'язок групи послуг (master_buh_service.master_buh_information_id) із конкретним
-- приміщенням (space_id). Джерело: postgresqldim9000.master_buh_information.

select
    id      as master_buh_information_id,
    space_id,
    master_buh_id,
    created_at,
    updated_at
from {{ source('postgresqldim9000', 'master_buh_information') }}
