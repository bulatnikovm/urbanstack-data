-- Довідник послуг. Джерело: postgresqldim9000.master_buh_service.
-- ⚠️ Джерело плутає імена: власний PK називається `id`, а бізнес-код послуги
-- (те, що стає service_type_code в dim_service) лежить у полі `service_id`.
-- Зберігаємо обидва явно під однозначними іменами.

select
    id                          as service_id,       -- PK, FK з stg_finance__billing_payments.service_id
    master_buh_information_id,
    cast(service_id as int64)  as service_type_code,
    name                        as service_name_raw,
    created_at,
    updated_at
from {{ source('postgresqldim9000', 'master_buh_service') }}
