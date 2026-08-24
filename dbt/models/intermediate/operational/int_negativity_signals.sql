-- Grain: один сигнал. Спільна стрічка всіх негативних/нейтральних взаємодій
-- мешканця, зведена до трьох полів: пріоритет × градація × бали.
--
-- Це матриця Макса, покладена в дані: пріоритет 1 текст / 2 оцінка / 3 дії,
-- градація safe / attention / trigger, бали з сіда `negativity_rules`.
-- Сенс шару — щоб додати канал (платні заявки, «Електроенергія», чати,
-- транскрибація) означало дописати один union, а не правити скор у трьох
-- місцях. Правила міняються в сідах без коду.
--
-- ⚠️ Що ПОКИ не підключено і чому:
--   * пріоритет 3 (дії) — потрібен стейджинг `paid_orders` + `desired_amount`
--     з master_buh. Це наступна фаза; канал найцінніший, бо єдиний, що працює
--     на мовчунів, але й найдовший;
--   * чати заявок і транскрибація дзвінків — їх НЕМАЄ в BigQuery взагалі
--     (`messenger_messages` — це черга Symfony, не чат мешканця);
--   * коментар до опитувань — у вигрузці `survey_answers` немає текстового
--     поля, тільки grade.
--
-- ⚠️ Участь у кампанії свідомо НЕ є окремим сигналом: заявка, з якою людина
-- увійшла в кампанію, уже порахована як текст. Кампанії працюють інакше —
-- як floor-правило в fct_resident_friction_monthly (див. коментар там).

with rules as (
    select priority, severity, points
    from {{ ref('negativity_rules') }}
),

lexicon as (
    select pattern, severity
    from {{ ref('negativity_lexicon') }}
    where severity in ('attention', 'trigger')
),

-- ── Пріоритет 1: текст заявки ────────────────────────────────────────────
order_text as (
    select
        'order_text'                     as channel,
        1                                as priority,
        cast(f.order_id as string)       as source_id,
        f.citizen_id,
        o.house_id,
        o.complex_id,
        f.created_at                     as occurred_at,
        f.text_severity                  as severity,
        f.is_osbb_intent,
        f.is_legal,
        f.is_collective,
        f.matched_patterns               as evidence
    from {{ ref('int_order_text_flags') }} f
    join {{ ref('fact_orders') }} o using (order_id)
    where f.citizen_id is not null
      and o.house_id is not null
      and not coalesce(o.is_test_complex, false)
),

-- ── Пріоритет 2: оцінка закриття заявки ──────────────────────────────────
-- Правило Макса: оцінка БЕЗ коментаря — пасивна дія (attention, не trigger),
-- бо людина «клацнула і пішла». Trigger дає тільки оцінка з коментарем, у
-- якому спрацював trigger-маркер того самого словника.
reviews as (
    select
        r.id                             as review_id,
        r.order_id,
        r.rating,
        r.comment,
        r.created_at,
        lower(normalize(coalesce(r.comment, ''), nfkc)) as comment_lower
    from {{ source('postgresqldim9000_operational', 'order_reviews') }} r
    where r.rating is not null
),

review_marks as (
    select
        rv.review_id,
        countif(l.severity = 'trigger')   as n_trigger_hits,
        countif(l.severity = 'attention') as n_attention_hits,
        string_agg(l.pattern, ' | ')      as matched_patterns
    from reviews rv
    join lexicon l on regexp_contains(rv.comment_lower, l.pattern)
    where rv.comment_lower != ''
    group by rv.review_id
),

order_rating as (
    select
        'order_review'                   as channel,
        2                                as priority,
        cast(rv.review_id as string)     as source_id,
        o.citizen_id,
        o.house_id,
        o.complex_id,
        rv.created_at                    as occurred_at,
        case
            when rv.rating <= 2 and coalesce(m.n_trigger_hits, 0) > 0 then 'trigger'
            when rv.rating <= 2                                      then 'attention'
            else 'safe'
        end                              as severity,
        false                            as is_osbb_intent,
        false                            as is_legal,
        false                            as is_collective,
        m.matched_patterns               as evidence
    from reviews rv
    join {{ ref('fact_orders') }} o on o.order_id = rv.order_id
    left join review_marks m on m.review_id = rv.review_id
    where o.citizen_id is not null
      and o.house_id is not null
      and not coalesce(o.is_test_complex, false)
),

unioned as (
    select * from order_text
    union all
    select * from order_rating
)

select
    to_hex(md5(concat(u.channel, '|', u.source_id))) as signal_id,
    u.channel,
    u.priority,
    u.severity,
    coalesce(r.points, 0)                       as points,
    u.citizen_id,
    u.house_id,
    u.complex_id,
    u.occurred_at,
    date_trunc(date(u.occurred_at), month)      as report_month,
    u.is_osbb_intent,
    u.is_legal,
    u.is_collective,
    u.evidence
from unioned u
left join rules r
  on r.priority = u.priority
 and r.severity = u.severity
