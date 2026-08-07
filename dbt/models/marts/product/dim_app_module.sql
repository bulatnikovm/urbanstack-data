-- Модулі застосунку. Джерело — seed product_module_catalog + агрегат по
-- каталогу подій (скільки event_type входить у модуль).
--
-- Замінює CASE `module_group`, скопійований у двох Looker-запитах з
-- розбіжністю ('7. Профіль та Авторизація' vs '7. Профіль'), через яку два
-- графіки на одній сторінці не джойнились за назвою модуля.
--
-- drop_off_window_days раніше був захардкоджений третім CASE у
-- custom_retention_4 — тепер це дані.

with modules as (

    select * from {{ ref('product_module_catalog') }}

),

event_counts as (

    select
        module_code,
        count(*)                        as n_event_types,
        countif(is_core_event)          as n_core_event_types
    from {{ ref('product_event_catalog') }}
    group by module_code

)

select
    m.module_code,
    m.module_name_ua,
    m.module_order,
    m.drop_off_window_days,
    m.module_code = 'technical'                             as is_technical,
    concat(m.module_name_ua, ' [', cast(m.drop_off_window_days as string), ' днів]')
                                                            as module_label_with_window,
    coalesce(ec.n_event_types, 0)                           as n_event_types,
    coalesce(ec.n_core_event_types, 0)                      as n_core_event_types
from modules as m
left join event_counts as ec on ec.module_code = m.module_code
