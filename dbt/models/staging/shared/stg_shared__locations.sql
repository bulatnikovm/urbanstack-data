-- Адреси. Джерело: postgresqldim9000.locations.
-- ⚠️ number тут — НЕ номер конкретного будинку (див. _shared__sources.yml) —
-- не використовувати для адреси, лише street/city.

select
    id      as location_id,
    street,
    city
from {{ source('postgresqldim9000_geo', 'locations') }}
