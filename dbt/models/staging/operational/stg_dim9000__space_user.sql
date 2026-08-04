-- Зв'язка користувач↔приміщення. Джерело: postgresqldim9000.space_user.

select
    user_id,
    space_id
from {{ source('postgresqldim9000_operational', 'space_user') }}
