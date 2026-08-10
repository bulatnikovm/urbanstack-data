-- Grain: одна відповідь (answer_id). INNER JOIN до int_survey_waves —
-- тестові/некласифіковані опитування (wave_description без розпізнаваного
-- ключового слова категорії — див. коментар в int_survey_waves.sql)
-- автоматично випадають.
--
-- ⚠️ areas дедуплікується до 1 рядка на survey_id (QUALIFY нижче) — сирі дані
-- НЕ гарантують 1:1 (див. _surveys__models.yml, id 431 — 10 area на 1 survey).
-- Це захист від тихого fan-out відповідей; справжній контроль —
-- tests/assert_survey_wave_areas_are_unique.sql, який провалиться, якщо нова
-- хвиля матиме такий дизайн — тоді цю дедуплікацію треба переглянути, не
-- покладатись на неї як на постійне рішення.

with answers as (
    select * from {{ ref('stg_dim9000__survey_answers') }}
),

waves as (
    select * from {{ ref('int_survey_waves') }}
),

areas as (
    select *
    from {{ ref('stg_dim9000__survey_areas') }}
    qualify row_number() over (partition by survey_id order by area_id) = 1
),

houses as (
    select * from {{ ref('dim_house') }}
),

complexes as (
    select * from {{ ref('dim_complex') }}
)

select
    a.answer_id,
    a.survey_id,
    w.wave_label,
    w.survey_category_ua,
    w.wave_month,
    coalesce(ar.complex_id, h.complex_id) as complex_id,
    coalesce(c.complex_name, hc.complex_name) as complex_name,
    ar.house_id,
    h.house_number,
    ar.area_type,
    a.grade,
    nullif(trim(a.comment), '') as comment,
    nullif(trim(a.comment), '') is not null as has_comment,
    a.answered_at
from answers a
inner join waves w on w.survey_id = a.survey_id
left join areas ar on ar.survey_id = a.survey_id
left join houses h on h.house_id = ar.house_id
left join complexes c on c.complex_id = ar.complex_id
left join complexes hc on hc.complex_id = h.complex_id
