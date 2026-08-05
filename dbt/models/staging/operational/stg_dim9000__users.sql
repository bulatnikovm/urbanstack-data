-- Користувачі додатку. Джерело: postgresqldim9000.users.
-- Тільки поля, потрібні для operational-агрегатів (ролі/верифікація/дати) —
-- PII (ім'я/телефон), password, slack_id намірено не вибираємо.
--
-- 2026-08-04: додано `user_phone_sk` — sha256-хеш телефону. Це НЕ послаблення
-- рішення вище: сирий телефон так само не виходить з моделі, а хеш потрібен як
-- єдиний спосіб зв'язати CRM-користувача з Amplitude-подіями (у подіях немає
-- user_id, лише user_properties.phone_number). Той самий вираз у
-- stg_amplitude__events — обидві сторони мають trim'итись однаково.

select
    id          as user_id,
    role,
    verified,
    created_at,
    updated_at,

    case
        when phone is null then null
        when trim(phone) = '' then null
        else to_hex(sha256(trim(phone)))
    end         as user_phone_sk

from {{ source('postgresqldim9000_operational', 'users') }}
