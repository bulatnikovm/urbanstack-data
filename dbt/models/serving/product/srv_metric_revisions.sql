{{ config(
    materialized = 'incremental',
    unique_key   = ['series_key', 'dimension_value', 'report_month'],
    incremental_strategy = 'merge',
    merge_update_columns = ['current_value', 'last_checked_date', 'month_status']
) }}

-- ЖУРНАЛ РЕВІЗІЙ: наскільки значення ВЖЕ ЗАКРИТОГО місяця змінилось відтоді,
-- як ми побачили його вперше.
--
-- ── Навіщо ────────────────────────────────────────────────────────────────
-- Історія в цьому домені МУТУЄ. Атрибути користувача (`verified`, `role`) і
-- прив'язки до приміщень читаються as-of-today і застосовуються до всіх
-- місяців (`int_user_exclusions` робить `cross join months`). Точний вимір на
-- 13 щоденних зрізах (docs/data_drift_findings.md §A): липень 2026 за 12 днів
-- втратив 25 «потенційних» і набрав 43 «підтверджених», монотонно.
--
-- Поки це десятки людей — це механіка, не новина. Але рівно тим самим шляхом
-- зайде й катастрофа: якщо `space_user` (повна заміна щоночі, без PK і без
-- сліду видалень) приїде наполовину порожнім, тисячі людей зникнуть З УСІЄЇ
-- ІСТОРІЇ. На графіку це виглядатиме як плавне зниження бази — жоден MoM- чи
-- z-детектор такого не побачить, бо ВСІ місяці поїдуть разом і форма ряду
-- збережеться.
--
-- Тому ловимо не форму ряду, а сам факт «закритий місяць змінився» — і
-- порівнюємо зі смугою нормального дрейфу (macro drift_band_pct_per_month).
--
-- ⚠️ Ця модель накопичувальна: `first_value` пишеться ОДИН раз при першій
-- появі рядка і далі не оновлюється (його немає в merge_update_columns).
-- Тому історія починається з першого прогону — до цього моменту ревізій не
-- видно. Перші 2-3 тижні таблиця буде майже порожня, це нормально.
-- Довантажити минуле нізвідки: BigQuery попередніх станів не зберігає.

with current_snapshot as (

    select
        series_key,
        metric_id,
        dimension_key,
        dimension_value,
        report_month,
        report_month_key,
        value,
        source_kind,
        {{ month_status('report_month') }}      as month_status
    from {{ ref('srv_metric_timeseries') }}

    -- Поточний місяць не журналимо: він і має змінюватись щодня, це не ревізія.
    -- Ревізія — це коли міняється те, що мінятись уже НЕ ПОВИННО.
    where report_month < date_trunc(current_date(), month)

),

-- Базова лінія з git-історії (див. dbt/scripts/build_revision_baseline.py).
-- Без неї модель починає спостереження «з сьогодні» і мовчить кілька тижнів.
-- З нею first_value одразу вказує на 2026-08-05, і детектор ревізій має
-- 12 днів реальної історії з першого ж прогону.
baseline as (

    select
        series_key,
        dimension_value,
        report_month_key,
        baseline_value,
        baseline_date
    from {{ source('serving_baseline', 'product_metric_baseline') }}

)

select
    c.series_key,
    c.metric_id,
    c.dimension_key,
    c.dimension_value,
    c.report_month,
    c.report_month_key,
    c.source_kind,
    c.month_status,

    coalesce(b.baseline_value, c.value)         as first_value,
    c.value                                     as current_value,
    coalesce(b.baseline_date, current_date())   as first_seen_date,
    current_date()                              as last_checked_date

from current_snapshot as c
left join baseline as b
    on  b.series_key       = c.series_key
    and b.dimension_value  = c.dimension_value
    and b.report_month_key = c.report_month_key

{% if is_incremental() %}

    -- При інкременті merge оновить тільки current_value / last_checked_date /
    -- month_status; first_value і first_seen_date лишаться від першої появи.
    -- Нові (series × місяць) вставляться як є.

{% endif %}
