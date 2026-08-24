-- Grain: заявка (order_id). Лексичний розбір тексту заявки.
--
-- Навіщо: гіпотеза «негативщики матюкаються» на наших даних не працює —
-- ненормативна лексика є в 0.03% заявок (38 із 123 182 за 2024+). Робочий
-- маркер — юридично-ескалаційний регістр («ПИСЬМОВО надати відповідь»,
-- «вимагаю», «згідно п. договору», «контролюючих органів»), він на два
-- порядки частіший і змістовно точніший.
--
-- Словник живе в сіді `negativity_lexicon` — правити його можна без коду.
-- Модель матеріалізується таблицею: нижче cross join заявок на патерни
-- (~163k x ~48 = 7.8 млн regexp), не варто це перераховувати на кожен ref.
--
-- `matched_patterns` лишаємо навмисно — без нього неможливо пояснити,
-- ЧОМУ будинок підсвітився, а пояснення тут важливіше за компактність.
--
-- ⚠️ Словник v1, зібраний по ~50 прочитаних заявках. Precision/recall НЕ
-- заміряні — до ручної розмітки 300-400 заявок вважати оцінкою, не істиною.

{{ config(materialized='table') }}

with orders as (
    select
        order_id,
        citizen_id,
        created_by_id,
        is_self_authored,
        created_at,
        description
    from {{ ref('stg_dim9000__orders') }}
    where description is not null
      and trim(description) != ''
),

normalized as (
    select
        *,
        lower(normalize(description, nfkc)) as text_lower,
        -- для детектора кампаній: тільки літери/цифри, схлопнуті пробіли
        trim(regexp_replace(
            regexp_replace(lower(normalize(description, nfkc)), r'[^\p{L}\p{N} ]', ' '),
            r'\s+', ' '
        )) as text_norm
    from orders
),

lexicon as (
    select pattern, flag_group, severity, weight
    from {{ ref('negativity_lexicon') }}
),

matches as (
    select
        n.order_id,
        l.flag_group,
        l.severity,
        l.pattern,
        l.weight
    from normalized n
    cross join lexicon l
    where regexp_contains(n.text_lower, l.pattern)
),

per_order as (
    select
        order_id,
        countif(flag_group = 'legal')          as n_legal_hits,
        countif(flag_group = 'outrage')        as n_outrage_hits,
        countif(flag_group = 'collective')     as n_collective_hits,
        countif(flag_group = 'osbb_intent')    as n_osbb_intent_hits,
        countif(flag_group = 'osbb_postfact')  as n_osbb_postfact_hits,
        countif(flag_group = 'repeat')         as n_repeat_hits,
        countif(flag_group = 'profanity')      as n_profanity_hits,
        -- градація Макса, задана в сіді по кожному патерну окремо
        countif(severity = 'trigger')          as n_trigger_hits,
        countif(severity = 'attention')        as n_attention_hits,
        sum(weight)                            as lexicon_weight,
        string_agg(distinct flag_group, ', ' order by flag_group) as matched_groups,
        string_agg(pattern, ' | ')                                as matched_patterns
    from matches
    group by order_id
)

select
    n.order_id,
    n.citizen_id,
    n.created_by_id,
    n.is_self_authored,
    n.created_at,
    date_trunc(date(n.created_at), month)      as report_month,
    n.text_norm,
    length(n.description)                      as text_length,
    -- перші 45 символів нормалізованого тексту: ключ для детектора кампаній
    substr(n.text_norm, 1, 45)                 as text_prefix45,

    coalesce(p.n_legal_hits, 0)         > 0    as is_legal,
    coalesce(p.n_outrage_hits, 0)       > 0    as is_outrage,
    coalesce(p.n_collective_hits, 0)    > 0    as is_collective,
    coalesce(p.n_osbb_intent_hits, 0)   > 0    as is_osbb_intent,
    coalesce(p.n_osbb_postfact_hits, 0) > 0    as is_osbb_postfact,
    coalesce(p.n_repeat_hits, 0)        > 0    as is_repeat_frustration,
    coalesce(p.n_profanity_hits, 0)     > 0    as is_profanity,

    -- зведений прапорець «ескалаційна заявка»: юридичний регістр, обурення
    -- або звернення від імені групи. Пост-фактум ОСББ сюди НЕ входить —
    -- це вже наслідок, а не сигнал.
    coalesce(p.n_legal_hits, 0)
      + coalesce(p.n_outrage_hits, 0)
      + coalesce(p.n_collective_hits, 0)
      + coalesce(p.n_osbb_intent_hits, 0) > 0  as is_escalation,

    -- ⚠️ safe тут означає «жодного ескалаційного маркера», а не «людина
    -- задоволена». Пост-фактум ОСББ має severity=none у сіді, тому теж
    -- потрапляє в safe: це фіксація факту виходу, а не тиск.
    case
        when coalesce(p.n_trigger_hits, 0)   > 0 then 'trigger'
        when coalesce(p.n_attention_hits, 0) > 0 then 'attention'
        else 'safe'
    end                                        as text_severity,

    coalesce(p.lexicon_weight, 0)              as lexicon_weight,
    p.matched_groups,
    p.matched_patterns
from normalized n
left join per_order p using (order_id)
