-- Банківські мерчант-акаунти (IBAN). Джерело: postgresqldim9000.tascombank_merchants.
-- ⚠️ БЕЗ КОЛОНКИ `private_key` — навмисно, це секрет, він не повинен потрапити
-- в жоден dbt-шар. Фільтр purpose='payment' зберігаємо з оригінального dim_llc
-- (тільки платіжні мерчанти, не інші типи акаунтів банку).

select
    id,
    iban,
    merchant_id,
    recipient_name,
    mfo,
    commission_profile_id,
    purpose
from {{ source('postgresqldim9000', 'tascombank_merchants') }}
where purpose = 'payment'
