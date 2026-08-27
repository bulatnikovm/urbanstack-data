-- Grain: будинок x місяць (тільки житлові, не тестові ЖК).
--
-- Замість одного «скора ризику» — СХОДИНКИ СТАДІЙ. Причини:
--   1) потрібна «динаміка популяції» — скільки будинків на якій стадії по
--      місяцях; це читається без пояснень і кожна стадія має свій сценарій дій;
--   2) навчати модель нема на чому: 13 подій виходу за три роки. Один
--      зважений скор виглядав би як модель, якою він не є.
--
-- Сходинки (беремо НАЙВИЩУ, що спрацювала):
--   0 норма
--   1 роздратування  — сервіс закриває заявки формально
--   2 юридизація     — поодинці вимагають документи й посилаються на договір
--   3 організація    — з'явилась ГРУПА, що координується (ЕСКАЛАЦІЙНА кампанія;
--                      побутова синхронність на кшталт «перезапустіть котельню»
--                      від 5 мешканців за годину сюди не рахується)
--   4 намір          — прямо заявлений вихід/зміна УК
--   5 пішли          — фіксація факту, не прогноз
--
-- Порядок 2 < 3 навмисний: юридична лексика зустрічається набагато частіше
-- за кампанії, тому «організація» — глибша сходинка, ніж «юридизація».
-- У першій версії було навпаки, і стадія 3 накривала половину будинків,
-- поглинаючи рідкісний і цінний сигнал кампаній.
--
-- ⚠️ Пороги відкалібровані по перцентилях розподілу за 2025-2026:
--   низькі оцінки  > 0.60  (p80 = 0.61)
--   юридичні       >= 3.0 на 100 кв. за 3 міс (p90 = 3.33) І >= 3 заявки
--   падіння        < 0.3 власної бази ДВА місяці поспіль
-- Це пріоритизатор для черги роботи, а не оцінка ймовірності. Правити
-- пороги тут — нормально, вони не витікають з жодної моделі.
--
-- ⚠️ CSAT-опитування сюди не входять: 3 750 із 3 794 відповідей не мають
-- house_id (голосування одне на весь ЖК). Єдине джерело оцінок з прив'язкою
-- до будинку — оцінки закриття заявок (order_reviews).

with houses as (
    select house_id, complex_id, complex_name, house_number, n_apartments,
           is_deactivated, deactivated_at
    from {{ ref('dim_house') }}
    where is_residential
      and not is_test_complex
      and n_apartments > 0
),

calendar as (
    select report_month
    from {{ ref('dim_calendar_month') }}
    where report_month >= '2023-01-01'
      -- поточний місяць неповний: 3-місячні вікна на ньому просідають штучно
      -- і стадія 5 («пішли») спрацьовує на половині будинків. Оперативні
      -- сигнали беруться з mart_campaigns, а не звідси.
      and report_month < date_trunc(current_date(), month)
),

spine as (
    select h.*, c.report_month
    from houses h
    cross join calendar c
    -- місяці після деактивації не показуємо: будинок уже не наш
    where h.deactivated_at is null
       or c.report_month <= date_trunc(date(h.deactivated_at), month)
),

orders_m as (
    select
        o.house_id,
        f.report_month,
        count(*)                                              as n_orders,
        count(distinct f.citizen_id)                          as n_authors,
        countif(f.is_escalation)                              as n_escalation,
        count(distinct if(f.is_escalation, f.citizen_id, null)) as n_escalation_people,
        countif(f.is_legal)                                   as n_legal,
        countif(f.is_osbb_intent)                             as n_osbb_intent,
        countif(f.is_osbb_postfact)                           as n_osbb_postfact,
        countif(f.is_repeat_frustration)                      as n_repeat
    from {{ ref('int_order_text_flags') }} f
    join {{ ref('fact_orders') }} o using (order_id)
    where o.house_id is not null
      -- Батьківська заявка групової сюди НЕ йде. Її текст пише УК, а не
      -- мешканець, тож як сигнал негативу він нічого не означає. До
      -- 2026-08-26 вона відсіювалась сама (у батька не було гео), і коли
      -- гео зʼявилось — фільтр довелось зробити явним, щоб модель ризику
      -- рахувала рівно те саме, що й раніше.
      -- ⚠️ Дочірні заявки тут ЛИШАЮТЬСЯ, і це відкрите питання: вони несуть
      -- citizen_id мешканця, хоча створила їх теж УК, тобто одна групова
      -- заявка виглядає як N звернень від N людей. Перевірити окремо.
      and not o.is_group_parent
    group by 1, 2
),

-- Детектор кампаній ловить будь-яку синхронність тексту, а не тільки
-- організований тиск: «перезапустіть котельню, потухла» від 5 мешканців за
-- годину формально теж кампанія. Зі 121 кампанії лише 20 мають ескалаційні
-- маркери. Для стадії рахуємо ТІЛЬКИ ескалаційні, побутові лишаємо окремою
-- колонкою — вони корисні операційно (одна аварія = 5 заявок), але це не ризик.
camp_m as (
    select
        p.house_id,
        p.report_month,
        count(distinct p.campaign_id) as n_campaigns,
        count(distinct p.citizen_id)  as n_campaign_people,
        count(distinct if(c.has_legal or c.has_collective or c.has_osbb_intent,
                          p.campaign_id, null)) as n_campaigns_escalation,
        count(distinct if(c.has_legal or c.has_collective or c.has_osbb_intent,
                          p.citizen_id, null))  as n_campaign_people_escalation
    from {{ ref('int_order_campaigns') }} p
    join {{ ref('mart_campaigns') }} c using (campaign_id)
    group by 1, 2
),

reviews_m as (
    select
        o.house_id,
        date_trunc(date(r.created_at), month) as report_month,
        count(*)                              as n_reviews,
        countif(r.rating <= 2)                as n_reviews_low,
        avg(r.rating)                         as avg_rating
    from {{ source('postgresqldim9000_operational', 'order_reviews') }} r
    join {{ ref('fact_orders') }} o on o.order_id = r.order_id
    where o.house_id is not null
      -- Той самий явний фільтр, що й вище: оцінку закриття групової заявки
      -- ставить УК, а не мешканець.
      and not o.is_group_parent
    group by 1, 2
),

joined as (
    select
        s.house_id,
        s.complex_id,
        s.complex_name,
        s.house_number,
        s.n_apartments,
        s.deactivated_at,
        s.report_month,
        coalesce(o.n_orders, 0)             as n_orders,
        coalesce(o.n_authors, 0)            as n_authors,
        coalesce(o.n_escalation, 0)         as n_escalation,
        coalesce(o.n_escalation_people, 0)  as n_escalation_people,
        coalesce(o.n_legal, 0)              as n_legal,
        coalesce(o.n_osbb_intent, 0)        as n_osbb_intent,
        coalesce(o.n_osbb_postfact, 0)      as n_osbb_postfact,
        coalesce(o.n_repeat, 0)             as n_repeat,
        coalesce(c.n_campaigns, 0)                    as n_campaigns,
        coalesce(c.n_campaign_people, 0)              as n_campaign_people,
        coalesce(c.n_campaigns_escalation, 0)         as n_campaigns_esc,
        coalesce(c.n_campaign_people_escalation, 0)   as n_campaign_people_esc,
        coalesce(r.n_reviews, 0)            as n_reviews,
        coalesce(r.n_reviews_low, 0)        as n_reviews_low,
        r.avg_rating
    from spine s
    left join orders_m  o on o.house_id = s.house_id and o.report_month = s.report_month
    left join camp_m    c on c.house_id = s.house_id and c.report_month = s.report_month
    left join reviews_m r on r.house_id = s.house_id and r.report_month = s.report_month
),

rolled as (
    select
        *,
        sum(n_orders)             over w3  as orders_3m,
        sum(n_escalation)         over w3  as escalation_3m,
        sum(n_legal)              over w3  as legal_3m,
        sum(n_campaigns)          over w3  as campaigns_3m,
        sum(n_campaign_people)    over w3  as campaign_people_3m,
        sum(n_campaigns_esc)      over w3  as campaigns_esc_3m,
        sum(n_campaign_people_esc) over w3 as campaign_people_esc_3m,
        sum(n_reviews)            over w3  as reviews_3m,
        sum(n_reviews_low)        over w3  as reviews_low_3m,
        sum(n_osbb_postfact)      over w3  as osbb_postfact_3m,
        sum(n_escalation_people)  over w6  as escalation_people_6m,
        sum(n_osbb_intent)        over w12 as osbb_intent_12m,
        sum(n_orders)             over w12 as orders_12m
    from joined
    window
        w3  as (partition by house_id order by report_month rows between 2  preceding and current row),
        w6  as (partition by house_id order by report_month rows between 5  preceding and current row),
        w12 as (partition by house_id order by report_month rows between 11 preceding and current row)
),

metrics as (
    select
        *,
        -- власна база будинку: місяці M-12..M-4, щоб порівнювати з собою,
        -- а не з іншими будинками (ЖК між собою незіставні)
        (orders_12m - orders_3m) / 9.0                          as orders_base_per_month,
        orders_3m / 3.0                                         as orders_recent_per_month,
        safe_divide(reviews_low_3m, nullif(reviews_3m, 0))      as low_rating_share_3m,
        100 * safe_divide(escalation_3m, n_apartments)          as escalation_p100_3m,
        100 * safe_divide(campaign_people_3m, n_apartments)     as campaign_people_p100_3m
    from rolled
),

collapse as (
    select
        *,
        (orders_base_per_month >= 3
         and orders_recent_per_month < 0.3 * orders_base_per_month) as is_collapsed,
        (orders_base_per_month >= 3
         and orders_recent_per_month < 0.5 * orders_base_per_month) as is_halved
    from metrics
),

-- ⚠️ «Тихий» відтік (Севен) не ловиться сходинками, і це не дрібниця:
-- база рахується по власних місяцях M-12..M-4, тож при повільному згасанні
-- вона сповзає слідом за падінням і поріг обвалу не пробивається ніколи.
-- Севен 18-А впав із ~60 заявок/міс до ~25 за рік — і жодна сходинка не
-- спрацювала, бо кожен окремий місяць «нормальний» відносно попередніх.
--
-- Тому це ОКРЕМИЙ прапорець, а не сходинка. Конфліктна траєкторія (сходинки)
-- і мовчазне згасання — два різні режими відтоку, їх не можна складати в
-- одну шкалу: будинок може згасати без жодного конфлікту, і навпаки.
faded as (
    select
        *,
        (is_halved
         and lag(is_halved, 1) over (partition by house_id order by report_month)
         and lag(is_halved, 2) over (partition by house_id order by report_month)
        ) as f_fading
    from collapse
),

staged as (
    select
        *,
        case
            when orders_base_per_month >= 3
            then greatest(0.0, least(1.0,
                 1 - safe_divide(orders_recent_per_month, orders_base_per_month)))
        end as engagement_drop,

        -- 5: обвал активності ДВА місяці поспіль (поведінковий сигнал, його
        -- важко імітувати) АБО пост-фактум маркери РАЗОМ із падінням.
        --
        -- Пост-фактум сам по собі стадію не дає: мешканці регулярно згадують
        -- ОСББ сусіднього будинку («працівники ОСББ повідомили, що…»), і на
        -- цьому 53/46 та 14-В хибно ловились як «пішли» при повністю
        -- нормальній активності.
        ((is_collapsed
          and lag(is_collapsed) over (partition by house_id order by report_month))
         or (osbb_postfact_3m >= 2
             and coalesce(
                 1 - safe_divide(orders_recent_per_month, nullif(orders_base_per_month, 0)),
                 0) >= 0.4)) as f_left,
        osbb_intent_12m > 0                                      as f_intent,
        -- нормуємо на розмір будинку: 2 юридичні заявки в будинку на 400 кв.
        -- це фон, у будинку на 40 кв. — подія.
        -- Поріг 2.3 = p90 розподілу ПІСЛЯ чистки словника (до чистки p90 був
        -- 3.33 — його роздували 1 269 рутинних «надішліть акт звірки»).
        -- Перекалібрувати цей поріг ОБОВ'ЯЗКОВО після кожної правки словника,
        -- інакше стадія тихо звужується або розповзається.
        (legal_3m >= 2
         and 100 * safe_divide(legal_3m, n_apartments) >= 2.3)   as f_legal,
        campaigns_esc_3m >= 1                                    as f_campaign,
        (reviews_3m >= 5
         and safe_divide(reviews_low_3m, reviews_3m) > 0.60)     as f_irritation
    from faded
)

select
    house_id,
    complex_id,
    complex_name,
    house_number,
    n_apartments,
    report_month,
    deactivated_at,

    case
        when f_left       then 5
        when f_intent     then 4
        when f_campaign   then 3
        when f_legal      then 2
        when f_irritation then 1
        else 0
    end as risk_stage,

    case
        when f_left       then '5 · пішли'
        when f_intent     then '4 · намір'
        when f_campaign   then '3 · організація'
        when f_legal      then '2 · юридизація'
        when f_irritation then '1 · роздратування'
        else '0 · норма'
    end as risk_stage_ua,

    -- окремий режим: мовчазне згасання, не сходинка (див. коментар вище)
    coalesce(f_fading, false) as is_fading,

    -- те, що має потрапити в чергу роботи: або конфліктна траєкторія,
    -- або згасання
    (case
        when f_left then 5 when f_intent then 4 when f_campaign then 3
        when f_legal then 2 when f_irritation then 1 else 0
     end >= 2) or coalesce(f_fading, false) as needs_attention,

    f_left        as is_left,
    f_intent      as is_intent,
    f_legal       as is_legalizing,
    f_campaign    as is_organizing,
    f_irritation  as is_irritated,

    n_orders,
    n_authors,
    orders_3m,
    round(orders_base_per_month, 2)   as orders_base_per_month,
    round(orders_recent_per_month, 2) as orders_recent_per_month,
    round(engagement_drop, 3)         as engagement_drop,
    escalation_3m,
    escalation_people_6m,
    legal_3m,
    campaigns_3m,
    campaign_people_3m,
    campaigns_esc_3m,
    campaign_people_esc_3m,
    osbb_intent_12m,
    osbb_postfact_3m,
    reviews_3m,
    reviews_low_3m,
    round(low_rating_share_3m, 3)     as low_rating_share_3m,
    round(escalation_p100_3m, 2)      as escalation_p100_3m,
    round(campaign_people_p100_3m, 2) as campaign_people_p100_3m,
    avg_rating
from staged
