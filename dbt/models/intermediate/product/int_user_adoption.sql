-- ПІДКЛЮЧЕННЯ МЕШКАНЦЯ. Грануляція: user_id — рівно один рядок на людину.
--
-- ── Навіщо ────────────────────────────────────────────────────────────────
-- Акаунт у CRM заводить УК автоматично з білінгу, на кожен особовий рахунок.
-- Людина про це не знає: щоб потрапити в застосунок, вона має сама його
-- поставити й зареєструватись. Саме цей крок і вимірює модель.
--
-- Що `users.verified` — це НЕ м'яка конверсія, а бінарний шлюз, перевірено
-- прямо (2026-09-02): серед НЕпідтверджених події в застосунку мають 0,1%
-- (16 людей з 17 611), серед підтверджених — 92,2%. Тобто «непідтверджений»
-- означає «жодного разу не заходив».
--
-- ── Головне обмеження: у `verified` НЕМАЄ відмітки часу ───────────────────
-- У `postgresqldim9000.users` немає ні `verified_at`, ні чогось схожого —
-- лише поточний стан прапорця. Тому дату реєстрації наближаємо ПЕРШОЮ ПОДІЄЮ
-- в Amplitude. Наближення чесне (зв'язок «підтверджений ⇄ є події» тримається
-- на 92%), але працює тільки для акаунтів від 2024-01: раніше в Amplitude
-- даних фактично немає (до жовтня 2023 — технічний шум, кінець 2023 — 1-11
-- юзерів/міс), і будь-який старий акаунт отримав би «першу подію» у 2024-му
-- незалежно від того, коли він насправді зареєструвався.
--
-- Звідси `is_measurable`: рядки поза цим вікном лишаються в моделі (вони
-- потрібні для підрахунку накопичених непідключених), але в НІЯКИХ метриках
-- швидкості не беруть участі.
--
-- ── Зрілість, а не нуль ───────────────────────────────────────────────────
-- `is_mature_7d/30d/90d` — чи минуло вже стільки днів від заведення акаунта.
-- Без цього поточний місяць ЗАВЖДИ показував би D90 = 0%, бо дев'яносто днів
-- ще не минуло, і кожен місяць хтось прибігав би з «у нас усе впало». Частку
-- рахувати можна лише всередині зрілих: і чисельник, і знаменник.

with users as (

    select
        user_id,
        user_phone_sk,
        created_at                                  as provisioned_at,
        date(created_at)                            as provisioned_date,
        date_trunc(date(created_at), month)          as provision_month,
        verified                                    as is_registered
    from {{ ref('stg_dim9000__users') }}
    where role like '%CITIZEN%'

),

-- Прив'язка до будинку — з ОСТАННЬОГО наявного місяця в спільному механізмі
-- виключення. Беремо `home_*`, а не `primary_*`: `primary_*` порожній для
-- виключених, і будинок, який пішов з УК, втратив би всю свою історію
-- підключення заднім числом.
attribution as (

    select
        user_id,
        home_house_id                               as house_id,
        home_complex_id                             as complex_id,
        home_is_apartment                           as is_apartment,
        is_active_resident,
        is_confirmed,
        exclusion_reason
    from {{ ref('int_user_exclusions') }}
    qualify row_number() over (
        partition by user_id order by report_month desc
    ) = 1

),

-- Перша подія = момент реєстрації (див. шапку). Межа 2024-01-01 — та сама,
-- що в календарі int_user_exclusions, і з тієї ж причини.
first_event as (

    select
        user_phone_sk,
        min(event_date)                             as first_event_date
    from {{ ref('stg_amplitude__events') }}
    where user_phone_sk is not null
      and event_date >= '2024-01-01'
    group by user_phone_sk

),

joined as (

    select
        u.user_id,
        u.user_phone_sk,
        u.provisioned_at,
        u.provisioned_date,
        u.provision_month,
        u.is_registered,

        a.house_id,
        a.complex_id,
        a.is_apartment,
        a.is_active_resident,
        a.is_confirmed,
        a.exclusion_reason,

        f.first_event_date,

        -- 15 людей мають першу подію РАНІШЕ за створення акаунта (акаунт
        -- перестворювали). Затискаємо в нуль, а не викидаємо: людина
        -- підключена, і день у неї нульовий.
        greatest(date_diff(f.first_event_date, u.provisioned_date, day), 0)
                                                    as days_to_first_event,

        u.provisioned_date >= '2024-01-01'          as is_measurable,

        date_diff(current_date(), u.provisioned_date, day) >= 7   as is_mature_7d,
        date_diff(current_date(), u.provisioned_date, day) >= 30  as is_mature_30d,
        date_diff(current_date(), u.provisioned_date, day) >= 90  as is_mature_90d

    from users as u
    inner join attribution as a on a.user_id = u.user_id
    left join first_event as f  on f.user_phone_sk = u.user_phone_sk

)

select
    *,

    first_event_date is not null                                as has_ever_opened,

    days_to_first_event is not null and days_to_first_event <= 7   as reg_within_7d,
    days_to_first_event is not null and days_to_first_event <= 30  as reg_within_30d,
    days_to_first_event is not null and days_to_first_event <= 90  as reg_within_90d,

    -- Корзини для графіка розподілу. Разом дають 100% вимірюваних.
    case
        when days_to_first_event is null then 'never'
        when days_to_first_event = 0     then 'd0'
        when days_to_first_event <= 7    then 'd1_7'
        when days_to_first_event <= 30   then 'd8_30'
        when days_to_first_event <= 90   then 'd31_90'
        else 'd90plus'
    end                                                         as time_to_open_bucket

from joined
