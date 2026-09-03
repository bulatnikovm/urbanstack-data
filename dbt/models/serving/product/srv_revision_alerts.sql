{{ config(materialized = 'view') }}

-- Тривоги по ретроактивній мутації історії: закритий місяць змінився сильніше,
-- ніж пояснює відомий механізм.
--
-- Це ДРУГИЙ, незалежний від `srv_metric_anomalies` детектор, і він ловить те,
-- чого перший не побачить у принципі.
--
-- ── Чому потрібні обидва ──────────────────────────────────────────────────
-- `srv_metric_anomalies` дивиться на ФОРМУ ряду: чи вибивається місяць із
-- сусідів. Але якщо `space_user` приїде наполовину порожнім, з бази зникнуть
-- люди в УСІХ місяцях одночасно — ряд просяде рівномірно, форма збережеться,
-- z-score не зрушить. Класичний сліпий кут MoM/z-детекторів.
--
-- Тут дивимось не на форму, а на факт: значення закритого місяця змінилось
-- відносно того, яким ми його побачили вперше. Норму знаємо не «на око», а
-- з виміру на 13 щоденних зрізах (docs/data_drift_findings.md §A):
-- CRM-ряди ~0,2-0,7%/міс, подієві ~0, змішані найширші.

with revisions as (

    select * from {{ ref('srv_metric_revisions') }}

),

thresholds as (

    select series_key, min_abs_change
    from {{ ref('product_metric_series') }}

),

scored as (

    select
        r.series_key,
        r.metric_id,
        r.dimension_key,
        r.dimension_value,
        r.report_month,
        r.report_month_key,
        r.source_kind,
        r.month_status,

        r.first_value,
        r.current_value,
        r.first_seen_date,
        r.last_checked_date,

        r.current_value - r.first_value                             as revision_abs,
        safe_divide(r.current_value - r.first_value, abs(r.first_value)) as revision_pct,

        -- Скільки МІСЯЦІВ календарного часу минуло з першого спостереження.
        -- Дрейф накопичується з часом, тому смугу масштабуємо, а не тримаємо
        -- фіксованою: місяць, за яким спостерігаємо півроку, законно встиг
        -- зсунутись більше, ніж той, що з'явився тиждень тому.
        greatest(
            date_diff(r.last_checked_date, r.first_seen_date, day) / 30.0,
            1.0 / 30.0
        )                                                           as months_observed,

        {{ drift_band_pct_per_month('r.source_kind') }}             as band_pct_per_month,

        t.min_abs_change

    from revisions as r
    left join thresholds as t on t.series_key = r.series_key

),

final as (

    select
        *,
        band_pct_per_month * months_observed                        as allowed_drift_pct,

        -- Абсолютний фільтр — той самий `min_abs_change`, що й у детекторі
        -- аномалій: «наскільки великою має бути зміна цього ряду, щоб про неї
        -- взагалі говорити». Одна калібровка на обидва детектори.
        --
        -- Спочатку тут стояло фіксоване «≥ 5 юзерів», і на реальних 12 днях
        -- це дало 6 тривог, з яких 5 — ЖК «Варшавський 3» на +11..14 юзерів.
        -- Перевірка показала, що це не викид: за ним щільно йдуть Ліпінка
        -- (0,385%) і Галактика (0,33%), тобто поріг просто різав хвіст
        -- нормального розподілу. А ловити ми хочемо масовий перезапис —
        -- це тисячі людей, не дванадцять.
        abs(revision_abs) >= coalesce(min_abs_change, 5)             as passes_abs_gate

    from scored

)

select
    * except (passes_abs_gate),

    (
        passes_abs_gate
        and abs(revision_pct) > allowed_drift_pct
    )                                                               as is_revision_alert,

    case
        when revision_abs > 0 then 'up' when revision_abs < 0 then 'down'
    end                                                             as revision_direction,

    case
        when not (passes_abs_gate and abs(revision_pct) > allowed_drift_pct)
            then 'у межах відомого дрейфу'
        when abs(revision_pct) > 5 * allowed_drift_pct
            then 'історію переписало масово — перевір синк джерела'
        else 'закритий місяць змінився понад норму'
    end                                                             as verdict

from final
