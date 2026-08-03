-- Порт finance_dash.dim_space — тонка обгортка над int_space_geo
-- (personal_account дублює apartment_account_code, як в оригіналі).
-- house_number перейменовано в building_number — так називалась колонка
-- в оригінальному finance_dash.dim_space, зберігаємо для сумісності.

select
    space_id,
    section_id,
    house_id,
    section_name,
    house_number as building_number,
    complex_id,
    complex_name,
    complex_type,
    space_number,
    floor,
    property_kind,
    property_kind_ua,
    owner_id,
    cached_debt,
    apartment_account_code,
    apartment_account_code as personal_account,
    commercial_type,
    commercial_dabi_code,
    space_updated_at
from {{ ref('int_space_geo') }}
