-- Під'їзди/секції будинку. Джерело: postgresqldim9000.sections.

select
    id             as section_id,
    house_id,
    name           as section_name,
    floors,
    base_floor,
    created_at,
    updated_at
from {{ source('postgresqldim9000_geo', 'sections') }}
