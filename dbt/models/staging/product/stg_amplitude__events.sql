-- Єдина модель, що читає сирі Amplitude-події. Все інше в product-домені
-- ходить через неї.
--
-- Ключові рішення:
--   * `amplitude_id` → `device_id`. Це УСТАНОВКА, не користувач (20 064 девайси
--     на 13 919 телефонів). Канонічний ключ юзера — телефон (рішення 2026-08-04).
--   * Телефон НЕ виходить за межі staging: далі скрізь `user_phone_sk` =
--     sha256-хеш. Це зберігає рішення не тягнути PII у stg_dim9000__users.
--   * `session_id = -1` → NULL (Amplitude так позначає "немає сесії").
--   * Події з майбутніми датами відсікаються (кривий годинник клієнта, ~30 шт.).
--   * ДЕДУПЛІКАЦІЯ по uuid. Знайдено guard-тестом 2026-08-04: у сирій таблиці
--     64 626 зайвих рядків (0,48%) — точні копії (той самий uuid, event_time,
--     event_type, amplitude_id, session_id), артефакт повторної Stitch-синхронізації.
--     Без дедуплікації вони завищують усі підрахунки подій.
--     ⚠️ `event_id` НЕ є ключем: 34 430 унікальних значень на 13,4 млн рядків.

{{ config(
    materialized = 'incremental',
    incremental_strategy = 'insert_overwrite',
    partition_by = {'field': 'event_date', 'data_type': 'date', 'granularity': 'day'},
    cluster_by = ['event_type']
) }}

with source as (

    select * from {{ source('postgresqldim9000_product', 'EVENTS_407641') }}
    where date(event_time) <= current_date()

    {% if is_incremental() %}
      -- Stitch/Amplitude віддають події із запізненням — перезаписуємо хвіст.
      and date(event_time) >= (
          select date_sub(max(event_date), interval 3 day) from {{ this }}
      )
    {% endif %}

),

renamed as (

    select
        uuid                                            as event_uuid,
        event_id,
        event_time,
        date(event_time)                                as event_date,
        date_trunc(date(event_time), month)             as event_month,
        date_trunc(date(event_time), week(monday))      as event_week,
        event_type,

        -- УСТАНОВКА додатку, не користувач. Для метрик версій/девайсів.
        amplitude_id                                    as device_id,
        nullif(session_id, -1)                          as session_id,

        -- Канонічний ключ користувача (хешований, PII не йде далі).
        case
            when json_value(user_properties, '$.phone_number') is null then null
            when trim(json_value(user_properties, '$.phone_number')) = '' then null
            when lower(json_value(user_properties, '$.phone_number')) like '%unknown%' then null
            else to_hex(sha256(trim(json_value(user_properties, '$.phone_number'))))
        end                                             as user_phone_sk,

        case
            when lower(platform) like '%ios%'     then 'iOS'
            when lower(platform) like '%android%' then 'Android'
            else 'Other'
        end                                             as os_type,
        os_version,
        version_name                                    as app_version,
        device_model,
        country,
        city

    from source

),

deduplicated as (

    select *
    from renamed
    qualify row_number() over (partition by event_uuid order by event_time) = 1

)

select
    *,
    user_phone_sk is not null as is_authenticated
from deduplicated
