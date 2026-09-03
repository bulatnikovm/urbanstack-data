-- ДЕТЕКТОР АНОМАЛІЙ. Один рядок на (series_key × dimension_value × місяць),
-- з вердиктом: аномалія це чи ні, і чому.
--
-- Побудований під конкретні виміряні властивості цих даних
-- (docs/data_drift_findings.md), а не «взагалі під часові ряди»:
--
--   1. Поточний місяць занижений ПОДВІЙНО — і днів менше, і 3-5% подій ще не
--      доїхали. Тому рівневі метрики поточного місяця не порівнюємо ніколи.
--   2. Останній закритий місяць «недозріває» ~7 днів (вихід на 99%).
--      Пороги ×2, помітка provisional.
--   3. Медіана+MAD, а не середнє+σ: на вікні 6-12 точок один викид роздуває σ
--      так, що наступна справжня аномалія вже не проходить поріг.
--   4. Абсолютний мінімум зміни — обов'язковий разом із відсотковим. Інакше
--      «2 → 5 користувачів» дає +150% і топить реальні сигнали.
--   5. Синхронний обвал багатьох рядів = «дані не доїхали», а не подія в
--      продукті. Позначаємо окремо й НЕ подаємо як інсайт (§7.1 плану:
--      без цього прапорця перший же авто-інсайт для СЕО буде хибним).

with ts as (

    select * from {{ ref('srv_metric_timeseries') }}

),

-- Попереднє значення в тому ж ряді.
with_prev as (

    select
        *,
        lag(value)        over w                            as prev_value,
        lag(report_month) over w                            as prev_month,
        {{ month_status('report_month') }}                  as month_status
    from ts
    window w as (partition by series_key, dimension_value order by report_month)

),

-- Історичне вікно: до 12 попередніх місяців ряду. Self-join, а не аналітична
-- функція, бо BigQuery не дозволяє PERCENTILE_CONT з рамкою вікна.
hist as (

    select
        t.series_key,
        t.dimension_value,
        t.report_month,
        h.value                                             as hist_value
    from with_prev as t
    inner join ts as h
        on  h.series_key      = t.series_key
        and h.dimension_value = t.dimension_value
        and h.report_month    <  t.report_month
        and h.report_month    >= date_sub(t.report_month, interval 12 month)

),

hist_median as (

    select
        series_key,
        dimension_value,
        report_month,
        count(*)                                            as n_hist,
        approx_quantiles(hist_value, 2)[offset(1)]          as hist_med
    from hist
    group by 1, 2, 3

),

-- MAD = медіана абсолютних відхилень від медіани. Другий прохід, бо потрібна
-- вже порахована медіана.
hist_mad as (

    select
        h.series_key,
        h.dimension_value,
        h.report_month,
        approx_quantiles(abs(h.hist_value - m.hist_med), 2)[offset(1)] as hist_mad
    from hist as h
    inner join hist_median as m
        on  m.series_key      = h.series_key
        and m.dimension_value = h.dimension_value
        and m.report_month    = h.report_month
    group by 1, 2, 3

),

scored as (

    select
        p.tenant_id,
        p.series_key,
        p.label_ua,
        p.metric_id,
        p.dimension_key,
        p.dashboard_section,
        p.dimension_value,
        p.report_month,
        p.report_month_key,
        p.value,
        p.prev_value,
        p.value_type,
        p.source_kind,
        p.direction_good,
        p.month_status,

        m.n_hist,
        m.hist_med,
        d.hist_mad,

        p.value - p.prev_value                              as mom_abs,
        safe_divide(p.value - p.prev_value, abs(p.prev_value)) as mom_pct,

        -- Робастний z-score. 0.6745 — множник, що робить MAD зіставним із σ
        -- для нормального розподілу (σ ≈ MAD / 0.6745).
        -- MAD = 0 означає ідеально плаский ряд: z не визначений, вирішує
        -- відсотковий поріг.
        case
            when d.hist_mad is null or d.hist_mad = 0 then null
            else 0.6745 * (p.value - m.hist_med) / d.hist_mad
        end                                                 as robust_z,

        -- Пороги: недозрілий місяць отримує вдвічі ширші, бо він об'єктивно
        -- занижений на 2-3% і без цього фонив би щомісяця перші 7 днів.
        p.mom_pct_threshold * if(p.month_status = 'provisional', 2, 1)
                                                            as effective_pct_threshold,
        p.min_abs_change

    from with_prev as p
    left join hist_median as m
        on  m.series_key      = p.series_key
        and m.dimension_value = p.dimension_value
        and m.report_month    = p.report_month
    left join hist_mad as d
        on  d.series_key      = p.series_key
        and d.dimension_value = p.dimension_value
        and d.report_month    = p.report_month

),

flagged as (

    select
        *,

        -- Чи достатньо велика зміна В АБСОЛЮТІ, щоб про неї взагалі говорити.
        coalesce(abs(mom_abs) >= min_abs_change, false)      as passes_abs_gate,

        -- Чи можна взагалі рахувати робастну статистику: потрібно ≥6 місяців
        -- історії (на коротшому вікні медіана й MAD самі по собі шум) і
        -- ненульовий MAD (нульовий = ідеально плаский ряд).
        coalesce(n_hist >= 6 and hist_mad > 0, false)        as has_robust_stat,

        -- ⚠️ Відсотковий поріг — ЗАПАСНИЙ варіант, а не додатковий тригер.
        --
        -- Спокуса — сигналити по «z АБО MoM%». На реальних даних це дало 22%
        -- рядів як аномалії: фіксований відсоток на волатильному ряді б'є
        -- постійно. Напр. `segment_sleeping` по ЖК «Грейт» зробив +47% у
        -- липні, але z = 1,4 — тобто цей ряд ЗАВЖДИ так стрибає, і новини в
        -- цьому нуль.
        --
        -- Сенс робастного z саме в тому, що він знає власну мінливість ряду.
        -- Якщо він порахований — він і вирішує. Фіксований відсоток вмикається
        -- тільки там, де z порахувати нізвідки (молодий ряд, плаский ряд), і
        -- тоді це чесний запасний варіант, а не другий шанс просигналити.
        coalesce(n_hist >= 6 and hist_mad > 0 and abs(robust_z) > 3.5, false)
                                                            as breaks_z,

        coalesce(
            not coalesce(n_hist >= 6 and hist_mad > 0, false)
            and abs(mom_pct) > effective_pct_threshold,
            false
        )                                                   as breaks_pct

    from scored

),

-- ── Запобіжник «дані не доїхали» ─────────────────────────────────────────
-- Продуктова подія б'є по одній-двох метриках. Обвал джерела кладе ВСІ ряди
-- місяця одночасно. Тому рахуємо частку рядів, що просіли в цьому місяці:
-- якщо просіла половина й більше — це інфраструктура, а не продукт.
month_wide as (

    select
        report_month,
        count(*)                                            as n_series,
        countif((breaks_pct or breaks_z) and mom_abs < 0)    as n_dropping,
        safe_divide(
            countif((breaks_pct or breaks_z) and mom_abs < 0),
            count(*)
        )                                                   as share_dropping
    from flagged
    where month_status != 'current'
    group by 1

),

final as (

    select
        f.* except (passes_abs_gate, breaks_pct, breaks_z, has_robust_stat),

        coalesce(w.share_dropping, 0)                       as month_share_dropping,

        -- Синхронний обвал ≥50% рядів місяця.
        coalesce(w.share_dropping >= 0.5, false)            as is_suspected_data_gap,

        case when f.mom_abs > 0 then 'up'
             when f.mom_abs < 0 then 'down'
        end                                                 as direction,

        -- Аномалія = (пробила відсотковий поріг АБО z) І пройшла абсолютний
        -- фільтр І місяць не поточний.
        (
            f.month_status != 'current'
            and f.passes_abs_gate
            and (f.breaks_pct or f.breaks_z)
        )                                                   as is_anomaly,

        case
            when f.month_status = 'current' then 'місяць триває — не порівнюємо'
            when not f.passes_abs_gate      then 'зміна замала в абсолюті'
            when f.breaks_z                 then 'відхилення від власного тренду (робастний z)'
            when f.breaks_pct               then 'різка зміна до попереднього місяця (історії замало для z)'
            when f.has_robust_stat          then 'у межах власної мінливості ряду'
            else 'у межах норми'
        end                                                 as verdict

    from flagged as f
    left join month_wide as w on w.report_month = f.report_month

)

select
    tenant_id,
    series_key,
    label_ua,
    metric_id,
    dimension_key,
    dashboard_section,
    dimension_value,
    report_month,
    report_month_key,
    month_status,
    source_kind,
    value_type,

    value,
    prev_value,
    mom_abs,
    mom_pct,
    hist_med,
    hist_mad,
    n_hist,
    robust_z,

    direction,
    direction_good,
    is_anomaly,
    is_suspected_data_gap,
    month_share_dropping,
    verdict,

    -- «Добре чи погано» — тільки коли для метрики визначено бажаний напрямок.
    case
        when not is_anomaly or direction is null then null
        when direction_good = 'neutral'          then 'neutral'
        when direction = direction_good          then 'good'
        else 'bad'
    end                                                     as impact,

    case
        when not is_anomaly then null
        when is_suspected_data_gap then 'data_gap'
        when abs(coalesce(robust_z, 0)) > 5
          or abs(coalesce(mom_pct, 0)) > 3 * effective_pct_threshold then 'critical'
        else 'warning'
    end                                                     as severity

from final
