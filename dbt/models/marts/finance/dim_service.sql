-- Порт finance_dash.dim_service.

select
    service_type_code,
    array_agg(service_name_raw order by updated_at desc limit 1)[offset(0)] as service_name,
    count(distinct service_id) as account_service_count
from {{ ref('stg_finance__services') }}
group by 1
