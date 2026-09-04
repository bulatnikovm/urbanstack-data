-- ВОРОНКА ПРИЙНЯТТЯ «НА ЗАРАЗ». Грануляція: house_id (часу у вимірі немає).
--
-- Та сама воронка, що в `mart_adoption_funnel_monthly`, але два нижні кроки
-- рахуються за КОВЗНІ 30 ДНІВ, а не за календарний місяць.
--
-- ── Навіщо окрема модель, а не колонка в місячній ────────────────────────
-- Помісячна воронка ламається саме тоді, коли вона найпотрібніша — на
-- початку місяця. Причина не в «неповному місяці», а глибша: перші два кроки
-- це ЗАПАС (скільки людей взагалі має рахунок і скільки зареєструвалось,
-- накопичено за всю історію), а два нижні — ПОТІК (скільки з них щось
-- зробили всередині вікна). Четвертого числа ділиться чотириденний потік на
-- пожиттєвий запас, і воронка показує 6% там, де насправді 29%.
--
-- Вирівнювання по дню місяця (порівняння 1-4 вересня з 1-4 серпня) цю
-- проблему НЕ лікує: воно робить чесним порівняння МІЖ місяцями, а сама
-- пропорція всередині воронки лишається безглуздою.
--
-- Виміряно на 2026-09-04 (четвертий день місяця):
--   з 1 вересня      2 357 заходили / 599 цільова дія
--   ковзні 30 днів   7 424          / 2 893
--   серпень цілком   7 678          / 3 243
-- Тобто ковзне вікно дає картину, майже рівну повному місяцю, і при цьому
-- вона СЬОГОДНІШНЯ. І головне — воно не падає в підлогу першого числа, а
-- їде щодня.
--
-- ⚠️ Останні 2-3 дні вікна завжди трохи занижені: 3-5% подій місяця
-- доїжджають ПІСЛЯ факту, на 99% виходить до сьомого дня
-- (`docs/data_drift_findings.md` §B). Це неусувна властивість реального
-- часу, а не похибка моделі, і сторінка мусить про це писати — інакше кожен
-- понеділок читатиметься як провал.

{% set window_days = 30 %}

with base as (

    -- Стан бази на ПОТОЧНИЙ місяць: скільки людей узагалі є і скільки з них
    -- зареєстровані. Це запас, і він не залежить від вікна активності.
    select * from {{ ref('int_user_base_monthly') }}
    where is_active_resident
      and house_id is not null
      and report_month = date_trunc(current_date(), month)

),

base_agg as (

    select
        house_id,
        count(distinct user_id)                                     as n_potential,
        count(distinct if(is_confirmed, user_id, null))              as n_registered
    from base
    group by house_id

),

-- Активність за вікно. Будинок беремо з ТІЄЇ САМОЇ бази, що й запас, — інакше
-- чисельник і знаменник розʼїхались би по різних зрізах геоприв'язки.
activity as (

    select
        b.house_id,
        e.user_phone_sk,
        max(e.is_core_event)                                        as is_core_active
    from {{ ref('int_events_enriched') }} as e
    inner join base as b on b.user_phone_sk = e.user_phone_sk
    where e.user_phone_sk is not null
      and e.event_date > date_sub(current_date(), interval {{ window_days }} day)
      and e.event_date <= current_date()
    group by b.house_id, e.user_phone_sk

),

activity_agg as (

    select
        house_id,
        count(distinct user_phone_sk)                               as n_visitors,
        count(distinct if(is_core_active, user_phone_sk, null))     as n_core_active
    from activity
    group by house_id

),

houses as (

    select
        house_id,
        house_address,
        complex_id,
        complex_name
    from {{ ref('dim_house') }}

)

select
    b.house_id,
    h.house_address,
    h.complex_id,
    h.complex_name,

    {{ window_days }}                                               as window_days,
    date_sub(current_date(), interval {{ window_days - 1 }} day)     as window_from,
    current_date()                                                  as window_to,

    b.n_potential,
    b.n_registered,
    coalesce(a.n_visitors, 0)                                       as n_visitors,
    coalesce(a.n_core_active, 0)                                    as n_core_active,
    b.n_potential - b.n_registered                                  as n_never_registered

from base_agg as b
left join activity_agg as a on a.house_id = b.house_id
inner join houses as h on h.house_id = b.house_id
