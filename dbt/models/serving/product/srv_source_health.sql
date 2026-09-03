{{ config(
    materialized = 'incremental',
    unique_key   = ['check_date', 'source_name'],
    incremental_strategy = 'merge'
) }}

-- Щоденний журнал «скільки рядків було в кожному джерелі». Один рядок на
-- (день × джерело), історія накопичується прогонами.
--
-- ── Навіщо ────────────────────────────────────────────────────────────────
-- `space_user` синхронізується Stitch'ем ПОВНОЮ ЗАМІНОЮ щоночі: у таблиці
-- немає первинного ключа, тому інкремент неможливий, і всі 9 833 рядки мають
-- однаковий `_sdc_received_at`. Ні `_sdc_deleted_at`, ні будь-якого сліду
-- попереднього стану немає (docs/data_drift_findings.md §D).
--
-- Наслідок: якщо синк відпрацює наполовину, таблиця повернеться меншою, і
-- частина людей мовчки зникне З УСІЄЇ ІСТОРІЇ одразу — бо база користувачів
-- будується від поточного стану прив'язок. Жоден існуючий тест цього не
-- побачить: дані формально валідні, просто їх менше.
--
-- Єдиний спосіб таке зловити — ПАМ'ЯТАТИ, скільки було вчора. BigQuery цього
-- не пам'ятає, тому пам'ятаємо ми. Ця модель — і є та пам'ять.
--
-- ⚠️ Модель має сенс тільки якщо запускається регулярно. Пропущений день —
-- дірка в історії, не помилка; базова лінія рахується по медіані, тому
-- поодинокі пропуски її не ламають.

with counted as (

    select 'space_user' as source_name,
           count(*)                         as row_count,
           count(distinct user_id)           as distinct_key_count,
           max(_sdc_received_at)             as source_synced_at
    from {{ source('postgresqldim9000_operational', 'space_user') }}

    union all
    select 'spaces',
           count(*),
           count(distinct if(owner_id is not null, owner_id, null)),
           max(_sdc_received_at)
    from {{ source('postgresqldim9000_geo', 'spaces') }}

    union all
    select 'users',
           count(*),
           countif(role = 'ROLE_CITIZEN'),
           max(_sdc_received_at)
    from {{ source('postgresqldim9000_operational', 'users') }}

    union all
    select 'houses',
           count(*),
           countif(deactivated_at is null),
           max(_sdc_received_at)
    from {{ source('postgresqldim9000_geo', 'houses') }}

    union all
    select 'sections',
           count(*),
           count(distinct house_id),
           max(_sdc_received_at)
    from {{ source('postgresqldim9000_geo', 'sections') }}

    -- Події: рахуємо тільки останні 45 днів, щоб не сканувати 6 GB щодня.
    -- Партиція по event_time робить це дешевим.
    union all
    select 'events_last_45d',
           count(*),
           count(distinct json_value(user_properties, '$.phone_number')),
           max(processed_time)
    from {{ source('postgresqldim9000_product', 'EVENTS_407641') }}
    where date(event_time) >= date_sub(current_date(), interval 45 day)
      and date(event_time) <= current_date()

)

select
    current_date()                                          as check_date,
    current_timestamp()                                     as checked_at,
    source_name,
    row_count,
    distinct_key_count,
    source_synced_at,

    -- Наскільки застарів сам синк. Для `space_user` це має бути < 1 дня —
    -- він переписується щоночі; якщо більше, Stitch стоїть.
    timestamp_diff(current_timestamp(), source_synced_at, hour) as sync_age_hours

from counted

{% if is_incremental() %}
    -- Перезапис сьогоднішнього рядка при повторному прогоні за день —
    -- merge по (check_date, source_name) робить це сам.
{% endif %}
