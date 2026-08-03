-- Деталізація приміщень типу "квартира" (особовий рахунок).
-- Джерело: postgresqldim9000.space_apartments.

select
    id             as space_id,   -- FK 1:1 -> spaces.id
    account        as apartment_account_code
from {{ source('postgresqldim9000_geo', 'space_apartments') }}
