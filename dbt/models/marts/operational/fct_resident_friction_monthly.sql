-- Grain: мешканець (citizen_id) × місяць. Рівень ЛЮДИНИ в моделі раннього
-- попередження відтоку. Дім і ЖК рахуються окремо
-- (mart_house_churn_risk_monthly / mart_house_segment_mix_monthly).
--
-- Дві класифікації поруч, і вони НЕ дублюють одна одну:
--   * `segment`           — наскільки гаряче зараз (шкала Макса, 0-100);
--   * `behaviour_segment` — ЩО з цим робити.
-- Однакові 85 балів в організатора і в хронічного скаржника означають
-- протилежні дії: першому потрібні переговори, другому — нормально закриті
-- заявки. Одним числом це не виражається, тому полів два.
--
-- ⚠️ Вікно, а не накопичення. Це головна правка до дошки Макса, де бал
-- копиться з початку спостережень. Перевірка на наших даних: та сама шкала
-- дає 1 Революціонера на вікні 90 днів, 38 на 12 місяцях і 128 на всій
-- історії — тобто вибір вікна змінює відповідь у 50 разів. Бал, який уміє
-- тільки рости, через два роки пофарбує весь портфель. Тому:
--   `tension_score` — вікно 3 місяці (поточний + 2 попередні);
--   історія        — окремим блоком полів (ever_/peak_/lifetime_).
-- «Вічний тег» Макса зберігається за змістом (людину не губимо з фокусу),
-- але перестає бути незмивним ярликом: у картці видно «зараз спокійний,
-- пік — Революціонер, 2 кампанії».
--
-- ⚠️ Мінус-балів за safe-взаємодії (-5/-3/-1 у Макса) свідомо немає: вікно
-- гасить саме. Шлях униз показуємо через `segment_trend_3m`, а не арифметикою.
--
-- ⚠️ Персональний рівень — НЕ для загального дашборду. Контур C, керівнику
-- комунікацій. На сторінку йдуть агрегати (mart_house_segment_mix_monthly).

with months as (
    select report_month
    from {{ ref('dim_calendar_month') }}
    where report_month >= '2024-01-01'
      -- поточний місяць неповний: 3-місячне вікно на ньому просідає
      and report_month < date_trunc(current_date(), month)
),

signals as (
    select * from {{ ref('int_negativity_signals') }}
    where report_month >= '2023-01-01'   -- запас на 12-місячні вікна
),

-- ── кампанії: не сигнал, а floor-правило ─────────────────────────────────
-- Заявка, з якою людина увійшла в кампанію, уже порахована як текст —
-- додавати за неї бали означало б рахувати двічі. Кампанія працює інакше:
-- вона не додає градус, вона доводить організованість, а це стрибок стану.
campaigns as (
    select
        p.citizen_id,
        p.report_month,
        count(distinct p.campaign_id) as n_campaigns_esc
    from {{ ref('int_order_campaigns') }} p
    join {{ ref('mart_campaigns') }} c using (campaign_id)
    where c.has_legal or c.has_collective or c.has_osbb_intent
    group by 1, 2
),

person_month as (
    select
        s.citizen_id,
        s.report_month,
        sum(s.points)                                              as points,
        countif(s.channel = 'order_text')                          as n_orders,
        countif(s.severity = 'trigger')                            as n_trigger,
        countif(s.severity = 'attention')                          as n_attention,
        countif(s.is_osbb_intent)                                  as n_osbb_intent,
        countif(s.is_legal)                                        as n_legal,
        countif(s.is_collective)                                   as n_collective,
        countif(s.channel = 'order_review'
                and s.severity in ('attention', 'trigger'))        as n_low_ratings,
        countif(s.channel = 'order_review' and s.severity = 'safe') as n_good_ratings,
        -- дім останнього сигналу в місяці: людина з приміщеннями в кількох
        -- ЖК рахується там, куди реально пише
        array_agg(s.house_id order by s.occurred_at desc limit 1)[offset(0)]   as last_house_id,
        array_agg(s.complex_id order by s.occurred_at desc limit 1)[offset(0)] as last_complex_id
    from signals s
    group by 1, 2
),

first_seen as (
    select citizen_id, min(report_month) as first_month
    from person_month
    group by 1
),

spine as (
    select f.citizen_id, m.report_month
    from first_seen f
    join months m on m.report_month >= greatest(f.first_month, date '2024-01-01')
),

joined as (
    select
        sp.citizen_id,
        sp.report_month,
        coalesce(pm.points, 0)          as points,
        coalesce(pm.n_orders, 0)        as n_orders,
        coalesce(pm.n_trigger, 0)       as n_trigger,
        coalesce(pm.n_attention, 0)     as n_attention,
        coalesce(pm.n_osbb_intent, 0)   as n_osbb_intent,
        coalesce(pm.n_legal, 0)         as n_legal,
        coalesce(pm.n_collective, 0)    as n_collective,
        coalesce(pm.n_low_ratings, 0)   as n_low_ratings,
        coalesce(pm.n_good_ratings, 0)  as n_good_ratings,
        coalesce(c.n_campaigns_esc, 0)  as n_campaigns_esc,
        pm.last_house_id,
        pm.last_complex_id
    from spine sp
    left join person_month pm
           on pm.citizen_id = sp.citizen_id and pm.report_month = sp.report_month
    left join campaigns c
           on c.citizen_id = sp.citizen_id and c.report_month = sp.report_month
),

rolled as (
    select
        *,
        sum(points)           over w3  as points_3m,
        sum(n_orders)         over w3  as orders_3m,
        sum(n_trigger)        over w3  as trigger_3m,
        sum(n_attention)      over w3  as attention_3m,
        sum(n_low_ratings)    over w3  as low_ratings_3m,
        sum(n_low_ratings)    over w6  as low_ratings_6m,
        sum(n_good_ratings)   over w6  as good_ratings_6m,
        sum(n_campaigns_esc)  over w6  as campaigns_esc_6m,
        sum(n_campaigns_esc)  over w12 as campaigns_esc_12m,
        sum(n_osbb_intent)    over w12 as osbb_intent_12m,
        sum(n_legal)          over w12 as legal_12m,
        sum(n_collective)     over w12 as collective_12m,
        sum(n_orders)         over w12 as orders_12m,
        -- історія замість «вічного тега»
        sum(n_campaigns_esc)  over wall as campaigns_esc_lifetime,
        sum(n_osbb_intent)    over wall as osbb_intent_lifetime,
        -- останній відомий дім: людина могла місяцями мовчати
        last_value(last_house_id ignore nulls)   over wall as main_house_id,
        last_value(last_complex_id ignore nulls) over wall as main_complex_id
    from joined
    window
        w3   as (partition by citizen_id order by report_month rows between 2  preceding and current row),
        w6   as (partition by citizen_id order by report_month rows between 5  preceding and current row),
        w12  as (partition by citizen_id order by report_month rows between 11 preceding and current row),
        wall as (partition by citizen_id order by report_month rows between unbounded preceding and current row)
),

based as (
    select
        *,
        -- власна база активності: місяці M-12..M-4, для детекції «мовчуна»
        (orders_12m - orders_3m) as orders_base_9m
    from rolled
),

scored as (
    select
        *,
        -- сума балів за вікном (шкала Макса), стеля 100
        least(100, points_3m) as points_capped,

        -- ── floor-правила ────────────────────────────────────────────────
        -- Лінійна сума недооцінює рідкісний, але вирішальний сигнал: за
        -- вагами Макса згадка ОСББ (+15) лишає людину «Спокійною», хоча це
        -- найсильніша відома ознака — 12 із 13 будинків, що пішли, мали такі
        -- згадки. Тому квалификатори піднімають стан незалежно від суми,
        -- а сума лишається для порядку всередині сегмента.
        case when osbb_intent_12m   > 0 then 41 else 0 end as floor_intent,
        case when campaigns_esc_6m >= 1 then 41 else 0 end as floor_campaign,
        case when campaigns_esc_12m >= 2 then 80 else 0 end as floor_organizer,
        -- «більше 5 одиниць по CSAT» з матриці Макса — правило про НАКОПИЧЕННЯ
        -- оцінок, його не виразити в одному сигналі, тому воно тут
        case when low_ratings_3m   >= 5 then 21 else 0 end as floor_ratings
    from based
),

final_score as (
    select
        *,
        greatest(points_capped, floor_intent, floor_campaign,
                 floor_organizer, floor_ratings) as tension_score
    from scored
),

segmented as (
    select
        *,
        case
            when tension_score >= 80 then 4
            when tension_score >= 41 then 3
            when tension_score >= 21 then 2
            else 1
        end as segment_no
    from final_score
),

-- перцентиль обсягу заявок ВСЕРЕДИНІ ЖК: ЖК між собою незіставні —
-- «Варшавський 2» комфорт-класу і «Ліпінка» дають різний фон за побудовою
volume_rank as (
    select
        citizen_id,
        report_month,
        percent_rank() over (
            partition by main_complex_id, report_month order by orders_12m
        ) as orders_pctile_in_complex
    from segmented
    where orders_12m > 0
),

enriched as (
    select
        s.*,
        v.orders_pctile_in_complex,
        max(s.segment_no) over (
            partition by s.citizen_id order by s.report_month
            rows between unbounded preceding and current row
        ) as peak_segment_no,
        s.segment_no - lag(s.segment_no, 3) over (
            partition by s.citizen_id order by s.report_month
        ) as segment_trend_3m
    from segmented s
    left join volume_rank v
           on v.citizen_id = s.citizen_id and v.report_month = s.report_month
)

select
    citizen_id,
    report_month,
    main_house_id,
    main_complex_id,

    tension_score,
    segment_no,
    case segment_no
        when 4 then '4 · Революціонер'
        when 3 then '3 · Тривожник'
        when 2 then '2 · Неспокійний'
        else        '1 · Спокійний'
    end as segment_ua,

    -- ЩО робити: сегмент дії, ортогональний шкалі
    case
        when campaigns_esc_12m >= 2
          or (campaigns_esc_12m >= 1 and (collective_12m >= 1 or legal_12m >= 2))
            then 'Організатор'
        when coalesce(orders_pctile_in_complex, 0) >= 0.9 and legal_12m <= 1
            then 'Хронічний'
        when low_ratings_6m >= 2
            then 'Розчарований'
        when orders_base_9m >= 6 and orders_3m = 0
            then 'Мовчун'
        else 'Звичайний'
    end as behaviour_segment,

    -- окремим прапорцем, бо мовчун може бути ще й організатором, і саме
    -- ця пара — найтривожніша: організований мешканець перестав писати
    (orders_base_9m >= 6 and orders_3m = 0) as is_silent,

    -- чому саме такий стан (без цього людині не можна дзвонити)
    array_to_string(array(
        select x from unnest([
            if(floor_organizer > 0, 'дві ескалаційні кампанії', null),
            if(floor_intent    > 0, 'згадка ОСББ за 12 міс',    null),
            if(floor_campaign  > 0, 'участь у кампанії',        null),
            if(floor_ratings   > 0, '5+ низьких оцінок',        null),
            if(points_capped   > 0, 'бали за взаємодії',        null)
        ]) x where x is not null
    ), ', ') as score_reason,

    points_capped,
    orders_3m,
    orders_12m,
    orders_base_9m,
    round(orders_pctile_in_complex, 3) as orders_pctile_in_complex,
    trigger_3m,
    attention_3m,
    low_ratings_3m,
    low_ratings_6m,
    good_ratings_6m,
    legal_12m,
    collective_12m,
    campaigns_esc_6m,
    campaigns_esc_12m,
    osbb_intent_12m,

    -- історія (замість «вічного тега»)
    peak_segment_no,
    campaigns_esc_lifetime,
    osbb_intent_lifetime > 0 as ever_osbb_intent,
    segment_trend_3m
from enriched
