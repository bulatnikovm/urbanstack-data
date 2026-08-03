-- Деталізація приміщень типу "комерція" (підтипи: parking/storeroom/commercial).
-- Джерело: postgresqldim9000.space_commercials.

select
    id             as space_id,   -- FK 1:1 -> spaces.id
    name           as commercial_name,
    type           as commercial_type,
    dabi           as commercial_dabi_code
from {{ source('postgresqldim9000_geo', 'space_commercials') }}
