-- Користувачі додатку. Джерело: postgresqldim9000.users.
-- Тільки поля, потрібні для operational-агрегатів (ролі/верифікація/дати) —
-- PII (ім'я/телефон), password, slack_id намірено не вибираємо.

select
    id          as user_id,
    role,
    verified,
    created_at,
    updated_at
from {{ source('postgresqldim9000_operational', 'users') }}
