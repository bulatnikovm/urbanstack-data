-- Grain: будинок × місяць. ДРУГА вісь ризику — склад населення.
-- Перша вісь (сходинки конфлікту) живе в mart_house_churn_risk_monthly,
-- третя (тихе згасання, `is_fading`) — там само.
--
-- Осі свідомо НЕ складаються в одне число. Сходинка відповідає на «що
-- відбувається», склад — на «хто живе», згасання — на «чи ще з нами
-- розмовляють». Будинок може бути тихим і при цьому вже втраченим (Севен),
-- або гучним і стабільним («Грейт»). Одна шкала ці випадки схлопує.
--
-- ⚠️ Дві правки до дошки Макса, обидві з перевірки на даних:
--
-- 1) ЗНАМЕННИК — активні мешканці, не всі квартири. З квартирами пороги
--    Макса недосяжні на порядок: максимум по портфелю — 4,8% «Неспокійних і
--    вище» від квартир (Варшавський 2, буд. 2). Поріг «Noisy = 21-35%» не
--    спрацював би ніде й ніколи: у будинку на 300 квартир це 63 людини.
--
-- 2) ПОРОГИ — перцентилі всередині портфеля на поточний місяць, не абсолютні
--    відсотки. Перцентиль заодно прибирає системну різницю ЖК: «Варшавський
--    2/3» — комфорт-клас з високими очікуваннями, «Ліпінка» при найгіршому в
--    компанії беклозі дає 0 негативних заявок. Це різні аудиторії, а не різна
--    мораль, і абсолютний поріг це плутає.
--
-- ⚠️ «Один Революціонер = Risky» лишається, але з контекстом. Голе правило
-- дає 4 влучання з 13 будинків, що пішли, і при цьому піднімає 25 живих
-- будинків. Тому Risky = верхній перцентиль АБО (революціонер І сходинка >= 2).
-- Один крикун у спокійному домі — це картка людини для контуру C, а не
-- червоний дім.

with friction as (
    select
        report_month,
        main_house_id as house_id,
        citizen_id,
        segment_no,
        orders_12m,
        campaigns_esc_6m,
        peak_segment_no
    from {{ ref('fct_resident_friction_monthly') }}
    where main_house_id is not null
      -- знаменник = ті, хто взагалі спілкувався з УК за останній рік
      and orders_12m > 0
),

mix as (
    select
        house_id,
        report_month,
        count(*)                        as n_active_residents,
        countif(segment_no >= 2)        as n_restless_plus,
        countif(segment_no >= 3)        as n_overthinker_plus,
        countif(segment_no = 4)         as n_revolutionary,
        countif(peak_segment_no = 4)    as n_ever_revolutionary,
        countif(campaigns_esc_6m >= 1)  as n_campaign_members
    from friction
    group by 1, 2
),

shares as (
    select
        *,
        safe_divide(n_restless_plus, n_active_residents)    as share_restless_plus,
        safe_divide(n_overthinker_plus, n_active_residents) as share_overthinker_plus
    from mix
),

-- Перцентиль рахуємо тільки по будинках з достатнім знаменником.
-- ⚠️ Поріг 20, а не 5: на перевірці «Ліпінка» 102 і 86 (14 і 22 активні
-- мешканці) вилізли в Ризикові через ОДНУ напружену людину — 1/14 дає
-- частку 7% і перцентиль 0.99. У малих будинках частка не має сенсу,
-- там працює сходинка і згасання, а не склад.
ranked as (
    select
        house_id,
        report_month,
        percent_rank() over (
            partition by report_month order by share_restless_plus
        ) as share_pctile
    from shares
    where n_active_residents >= 20
),

trend as (
    select
        s.*,
        r.share_pctile,
        s.share_restless_plus - lag(s.share_restless_plus, 3) over (
            partition by s.house_id order by s.report_month
        ) as share_delta_3m
    from shares s
    left join ranked r on r.house_id = s.house_id and r.report_month = s.report_month
),

-- ⚠️ Гістерезис сходинки. Знайдено перевіркою: буд. 10 «Варшавський Плюс»
-- за МІСЯЦЬ до виходу впав зі сходинки 3 на 1 і зник з черги — кампанія
-- просто вийшла за 3-місячне вікно. Організована група не розчиняється за
-- 30 днів, тому в чергу дивимось на максимум за півроку, а не на поточний
-- місяць. Сама сходинка лишається миттєвою: вона описує «що зараз».
staged as (
    select
        *,
        max(risk_stage) over (
            partition by house_id order by report_month
            rows between 5 preceding and current row
        ) as risk_stage_max_6m
    from {{ ref('mart_house_churn_risk_monthly') }}
)

select
    h.house_id,
    h.complex_id,
    h.complex_name,
    h.house_number,
    h.n_apartments,
    h.report_month,

    -- вісь 1 і 3 — переносимо поруч, щоб сторінка читала один рядок
    h.risk_stage,
    h.risk_stage_ua,
    h.risk_stage_max_6m,
    h.is_fading,

    -- вісь 2 — склад населення
    coalesce(t.n_active_residents, 0)   as n_active_residents,
    coalesce(t.n_restless_plus, 0)      as n_restless_plus,
    coalesce(t.n_overthinker_plus, 0)   as n_overthinker_plus,
    coalesce(t.n_revolutionary, 0)      as n_revolutionary,
    coalesce(t.n_ever_revolutionary, 0) as n_ever_revolutionary,
    coalesce(t.n_campaign_members, 0)   as n_campaign_members,
    round(t.share_restless_plus, 4)     as share_restless_plus,
    round(t.share_overthinker_plus, 4)  as share_overthinker_plus,
    round(t.share_pctile, 3)            as share_pctile,

    case
        when t.share_pctile is null then 'мало даних'
        -- до Ризикового два шляхи: верхній перцентиль (і мінімум троє людей,
        -- щоб це не був один крикун) або революціонер у домі, який уже
        -- в конфлікті
        when (t.share_pctile > 0.95 and coalesce(t.n_restless_plus, 0) >= 3)
          or (coalesce(t.n_revolutionary, 0) >= 1 and h.risk_stage_max_6m >= 2) then 'Ризиковий'
        when t.share_pctile > 0.80                                              then 'Напружений'
        when t.share_pctile > 0.50                                              then 'Шумний'
        else                                                                         'Спокійний'
    end as house_mood,

    -- швидкість поширення: саме вона відрізняє одного крикуна від зародку
    -- групи. Ні в моїй моделі, ні в Макса цього не було — у нього дім
    -- описаний статикою (частки), у мене подіями (сходинки).
    round(t.share_delta_3m, 4) as contagion_3m,

    -- єдина черга роботи: конфлікт (з гістерезисом) АБО згасання АБО склад
    (h.risk_stage >= 2
     or h.risk_stage_max_6m >= 3
     or h.is_fading
     or (coalesce(t.share_pctile, 0) > 0.95 and coalesce(t.share_delta_3m, 0) > 0)
    ) as needs_attention
from staged h
left join trend t
       on t.house_id = h.house_id
      and t.report_month = h.report_month
where h.report_month >= '2024-01-01'
