-- Grain: answer_id. Стрічка коментарів для сторінки CSAT — те, заради чого
-- опитування взагалі проводять: цифра каже «3,1», а що саме не так, видно
-- тільки з тексту.
--
-- Теми зібрані в масив, а не окремими рядками: на сторінці це один коментар
-- з кількома мітками, а не три однакові коментарі. Розкладку по темах
-- (де один коментар справді дає +1 кожній темі) робить окремий агрегат
-- на int_survey_comment_flags.
--
-- ⚠️ Персональних ідентифікаторів тут немає навмисно: ні user_id, ні
-- номера квартири. Будинок — найдрібніший розріз, який їде на дашборд.
-- Текст мешканця може містити імена (напр. конкретного охоронця) — це вже
-- так у поточному звіті Looker, аудиторія та сама, під Google-логіном.

with answers as (
    select * from {{ ref('fact_survey_answers') }}
    where comment is not null
),

themes as (
    select
        answer_id,
        array_agg(distinct problem_theme_ua order by problem_theme_ua) as themes,
        array_agg(distinct problem_category_ua order by problem_category_ua) as categories
    from {{ ref('int_survey_comment_flags') }}
    group by answer_id
)

select
    a.answer_id,
    a.wave_label,
    a.survey_category_ua,
    a.wave_month,
    a.complex_id,
    a.complex_name,
    a.house_id,
    a.house_number,
    a.house_address,
    a.grade,
    a.grade <= 2 as is_detractor,
    a.grade <= 3 as is_negative,
    a.comment,
    a.answered_at,
    coalesce(t.themes, []) as themes,
    coalesce(t.categories, []) as categories
from answers a
left join themes t on t.answer_id = a.answer_id
