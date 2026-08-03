-- Приміщення (квартира/комерція) — базова одиниця нерухомості.
-- Джерело: postgresqldim9000.spaces.

select
    id             as space_id,
    section_id,
    owner_id,
    kind,
    number         as space_number,
    floor,
    cached_debt,
    created_at,
    updated_at
from {{ source('postgresqldim9000_geo', 'spaces') }}
