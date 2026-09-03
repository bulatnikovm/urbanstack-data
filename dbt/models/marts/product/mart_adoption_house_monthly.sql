-- ВИПЕРЕДЖАЛЬНИЙ ПОКАЗНИК ПІДКЛЮЧЕННЯ. Грануляція:
-- house_id × provision_month × property_kind.
--
-- Відповідає на питання «з людей, яким УК завела акаунт у місяці M у будинку
-- H, скільки зайшли в застосунок за тиждень / місяць / три».
--
-- ── Чому тільки лічильники, без жодного відсотка ──────────────────────────
-- Провізіонінг НЕ є разовим сплеском при здачі будинку: у середньому в піковий
-- місяць осідає лише 24% мешканців будинку, а розтягнутий він на ~26 місяців
-- (люди докуповують квартири роками). Приклад — Змієнка 30, зданий 09.2025:
-- 94 людини в місяць передачі, далі 20-29 щомісяця, далі хвіст по 5-8.
--
-- Наслідок: на грануляції будинок × місяць лише 63 клітинки з 2 378 мають
-- бодай 20 людей. Відсоток, порахований у самій вітрині, стрибав би від 0 до
-- 100 на п'яти людях. Тому тут ЛІЧИЛЬНИКИ, а частку рахує дашборд із суми за
-- обраний період — той самий принцип, що в підсумковій колонці SLA
-- (CLAUDE.md §8д-5: «від абсолюту, а не середнє з місячних»).
--
-- ── Зрілість ──────────────────────────────────────────────────────────────
-- `n_mature_*` — знаменник, `n_reg_*` — чисельник, і обидва обмежені тими,
-- у кого відповідне вікно вже минуло. Інакше останній місяць завжди
-- показував би провал, якого немає.
--
-- ⚠️ Тільки вимірювані акаунти (від 2024-01) — див. шапку int_user_adoption.
-- Накопичені непідключені за всю історію рахуються в
-- mart_adoption_funnel_monthly, у якого таких обмежень немає.

with adoption as (

    select * from {{ ref('int_user_adoption') }}
    where is_measurable
      and house_id is not null

),

houses as (

    select
        house_id,
        house_address,
        complex_id,
        complex_name,
        created_at                                  as house_opened_at
    from {{ ref('dim_house') }}

)

select
    a.provision_month,
    format_date('%Y-%m', a.provision_month)                     as provision_month_key,
    a.house_id,
    h.house_address,
    h.complex_id,
    h.complex_name,
    if(a.is_apartment, 'apartment', 'commercial')               as property_kind,
    if(a.is_apartment, 'Квартира', 'Комерція / паркінг')        as property_kind_ua,
    date(h.house_opened_at)                                     as house_opened_date,

    count(*)                                                    as n_provisioned,

    -- Швидкість підключення. Частку рахувати ТІЛЬКИ як n_reg_Nd / n_mature_Nd.
    countif(a.is_mature_7d)                                     as n_mature_7d,
    countif(a.is_mature_7d and a.reg_within_7d)                 as n_reg_7d,
    countif(a.is_mature_30d)                                    as n_mature_30d,
    countif(a.is_mature_30d and a.reg_within_30d)               as n_reg_30d,
    countif(a.is_mature_90d)                                    as n_mature_90d,
    countif(a.is_mature_90d and a.reg_within_90d)               as n_reg_90d,

    -- Підсумок без вікна: зайшов колись / не зайшов жодного разу.
    countif(a.has_ever_opened)                                  as n_ever_opened,
    countif(not a.has_ever_opened)                              as n_never_opened,
    countif(a.is_registered)                                    as n_registered,

    -- Розподіл часу до першого входу. Сума корзин = n_provisioned.
    countif(a.time_to_open_bucket = 'd0')                       as n_d0,
    countif(a.time_to_open_bucket = 'd1_7')                     as n_d1_7,
    countif(a.time_to_open_bucket = 'd8_30')                    as n_d8_30,
    countif(a.time_to_open_bucket = 'd31_90')                   as n_d31_90,
    countif(a.time_to_open_bucket = 'd90plus')                  as n_d90plus,
    countif(a.time_to_open_bucket = 'never')                    as n_never

from adoption as a
inner join houses as h on h.house_id = a.house_id
group by
    a.provision_month, a.house_id, h.house_address,
    h.complex_id, h.complex_name, a.is_apartment, h.house_opened_at
