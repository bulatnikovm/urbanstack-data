-- Стр.1 (донати ОС / версія додатку). Грануляція: report_month × os_type ×
-- app_version.
--
-- Тут (і тільки тут) легітимно рахувати УСТАНОВКИ — donut "яка версія стоїть"
-- це питання про девайси, а не про людей. Тому поруч дві метрики:
--   active_users   — унікальні користувачі (телефон), канонічна
--   active_devices — унікальні установки (amplitude_id), для версійної аналітики
--
-- Оригінал (custom_version_os) рахував користувачів по news_scrn__view; тут
-- беремо будь-яку нетехнічну подію — донат про те, "хто на якій версії", і
-- прив'язка до одного екрана нічого не додає.

with events as (

    select
        event_month,
        os_type,
        app_version,
        user_phone_sk,
        device_id
    from {{ ref('int_events_enriched') }}
    where app_version is not null
      and not coalesce(is_technical, false)

)

select
    event_month                                                     as report_month,
    format_date('%Y-%m', event_month)                               as report_month_key,
    os_type,
    app_version,

    -- Сортувальний ключ для семантичних версій (1.5.10 > 1.5.9).
    safe_cast(split(app_version, '.')[safe_offset(0)] as int64)     as version_major,
    safe_cast(split(app_version, '.')[safe_offset(1)] as int64)     as version_minor,
    safe_cast(split(app_version, '.')[safe_offset(2)] as int64)     as version_patch,

    count(distinct user_phone_sk)                                   as active_users,
    count(distinct device_id)                                       as active_devices,
    count(*)                                                        as n_events

from events
group by event_month, os_type, app_version
