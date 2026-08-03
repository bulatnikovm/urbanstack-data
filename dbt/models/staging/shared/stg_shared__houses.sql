-- Будинки. Джерело: postgresqldim9000.houses.
-- Зберігаємо і `status`, і `deactivated_at` 1:1 — яке з них канонічне для
-- виключення деактивованих будинків, вирішується окремо в Фазі 2 для
-- продуктового/операційного доменів (баг #1, CLAUDE.md). dim_space
-- (фінансовий домен) навмисно НЕ фільтрує за жодним із цих полів.

select
    id             as house_id,
    complex_id,
    number         as house_number,
    status         as house_status,
    deactivated_at,
    location_id,
    use_complex_payment_provider,
    created_at,
    updated_at
from {{ source('postgresqldim9000_geo', 'houses') }}
