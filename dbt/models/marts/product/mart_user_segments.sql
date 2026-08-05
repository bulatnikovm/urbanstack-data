-- Стр.3 (донат) — сегменти життєвого циклу × версія застосунку. Снепшот на
-- current_date().
--
-- Деактивовані УК користувачі (ROLE_INACTIVATED_CITIZEN) виключаються — це
-- "видалені з БД", повертати нема кого. У оригіналі це робилось через
-- history_user_updates (шукали слід ролі в історії); тут — прямо через
-- поточну роль у int_user_identity, що надійніше й дешевше.

with current_version as (

    select app_version
    from {{ ref('stg_amplitude__events') }}
    where event_date >= date_sub(current_date(), interval 7 day)
      and app_version is not null
    group by app_version
    order by count(*) desc
    limit 1

),

deactivated as (

    select distinct user_phone_sk
    from {{ ref('int_user_identity') }}
    where is_deactivated
      and user_phone_sk is not null

),

users as (

    select
        user_phone_sk,
        lifecycle_segment_current,
        last_app_version,
        last_os_type
    from {{ ref('fct_user_monthly') }}
    qualify row_number() over (partition by user_phone_sk order by event_month desc) = 1

)

select
    u.lifecycle_segment_current                         as activity_segment,
    case
        when u.last_app_version = cv.app_version then 'Актуальна версія'
        else 'Стара версія'
    end                                                 as version_status,
    u.last_os_type                                      as os_type,
    count(*)                                            as users_count
from users as u
cross join current_version as cv
where u.user_phone_sk not in (select user_phone_sk from deactivated)
group by 1, 2, 3
