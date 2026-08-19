-- Розбір тексту коментаря CSAT за словником тем (seed survey_problem_lexicon).
-- Grain: answer_id × problem_theme_ua — один коментар МОЖЕ потрапити в кілька
-- тем, і це навмисно: людина в одному полі пише і про прибирання, і про
-- тарифи, і про охорону. Приписати їй «одну головну тему» означало б
-- викинути дві третини сказаного.
--
-- Той самий прийом, що int_order_text_flags для заявок: словник — дані
-- (сід), модель лише застосовує. Додати тему = дописати рядок у CSV.
--
-- Рахуємо ТІЛЬКИ коментарі з оцінкою <= 3. Розділ «Аналіз проблем» у
-- ручному звіті рахував саме негатив, і це не спрощення: у позитивних
-- коментарях ті самі слова означають протилежне («прибирання чудове»).
-- Словник тональності в нас немає, тому фільтруємо оцінкою, а не текстом.

with answers as (
    select
        answer_id,
        survey_id,
        wave_label,
        survey_category_ua,
        wave_month,
        complex_id,
        complex_name,
        house_id,
        house_number,
        house_address,
        grade,
        comment,
        answered_at
    from {{ ref('fact_survey_answers') }}
    where comment is not null
      and grade <= 3
),

lexicon as (
    select * from {{ ref('survey_problem_lexicon') }}
)

select
    a.answer_id,
    a.survey_id,
    a.wave_label,
    a.survey_category_ua,
    a.wave_month,
    a.complex_id,
    a.complex_name,
    a.house_id,
    a.house_number,
    a.house_address,
    a.grade,
    a.comment,
    a.answered_at,
    l.problem_category_ua,
    l.problem_theme_ua
from answers a
join lexicon l
  on regexp_contains(lower(a.comment), l.pattern)
group by
    a.answer_id, a.survey_id, a.wave_label, a.survey_category_ua, a.wave_month,
    a.complex_id, a.complex_name, a.house_id, a.house_number, a.house_address,
    a.grade, a.comment, a.answered_at,
    l.problem_category_ua, l.problem_theme_ua
