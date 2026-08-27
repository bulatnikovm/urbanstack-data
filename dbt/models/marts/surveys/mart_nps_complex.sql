-- Grain: wave_label × complex_id. Основа сторінки «NPS».
--
-- ── NPS рахується з часток, а не з середньої ──────────────────────────────
-- nps_score = %промоутерів − %детракторів, у пунктах від −100 до +100. Це
-- НЕ те саме, що середній бал, і одне з другого не виводиться: два ЖК з
-- однаковою середньою 5,5 можуть мати −20 і −60 залежно від того, чи люди
-- ставлять 5-6 (пасивно-погано) чи 1 і 10 навпіл (поляризація). Тому на
-- сторінці стоять обидві цифри, і жодна з них не «головна».
--
-- ⚠️ Переагрегувати цю модель угору (компанія загалом) можна ТІЛЬКИ через
-- лічильники: sum(promoters), sum(detractors), sum(votes) — і вже з них
-- рахувати частку. Середнє з nps_score по ЖК дало б «Севену» з одним
-- голосом ту саму вагу, що «Варшавському 2» зі ста шістнадцятьма. Готовий
-- avg_grade тут теж лежить поруч із grade_sum саме тому — та сама пастка,
-- що і в mart_survey_wave_summary.
--
-- ── Вибірка ───────────────────────────────────────────────────────────────
-- Знаменник репрезентативності — КВАРТИРИ (правка Артема від 2026-08-19 для
-- CSAT, тут та сама логіка й з тієї ж причини: знаменник не залежить від
-- того, скільки людей поставили застосунок). Частка від підтверджених
-- лишається поруч — вона відповідає на інше питання, наскільки активна
-- аудиторія, до якої опитування дійшло.

with answers as (
    select * from {{ ref('fact_nps_answers') }}
),

audience as (
    select
        complex_id,
        n_billing_accounts,
        n_users_confirmed,
        n_apartments
    from {{ ref('mart_monthly_complex_overview') }}
    qualify row_number() over (partition by complex_id order by report_month desc) = 1
),

summary as (
    select
        wave_label,
        wave_month,
        complex_id,
        complex_name,
        count(*)                as votes,
        countif(has_comment)    as comments,
        sum(grade)              as grade_sum,
        countif(is_promoter)    as promoters,
        countif(is_passive)     as passives,
        countif(is_detractor)   as detractors,
        countif(grade <= 2)     as grade_1_2,
        min(answered_at)        as first_answer_at,
        max(answered_at)        as last_answer_at
    from answers
    group by wave_label, wave_month, complex_id, complex_name
)

select
    s.wave_label,
    s.wave_month,
    s.complex_id,
    s.complex_name,
    s.votes,
    s.comments,
    s.grade_sum,
    s.promoters,
    s.passives,
    s.detractors,
    s.grade_1_2,
    safe_divide(s.grade_sum, nullif(s.votes, 0))                        as avg_grade,
    safe_divide(s.promoters, nullif(s.votes, 0))                        as promoter_share,
    safe_divide(s.detractors, nullif(s.votes, 0))                       as detractor_share,
    100 * (safe_divide(s.promoters, nullif(s.votes, 0))
         - safe_divide(s.detractors, nullif(s.votes, 0)))               as nps_score,
    au.n_apartments,
    au.n_users_confirmed,
    au.n_billing_accounts,
    safe_divide(s.votes, nullif(au.n_apartments, 0))                    as reach_of_apartments,
    safe_divide(s.votes, nullif(au.n_users_confirmed, 0))               as reach_of_confirmed,
    s.first_answer_at,
    s.last_answer_at
from summary s
left join audience au on au.complex_id = s.complex_id
