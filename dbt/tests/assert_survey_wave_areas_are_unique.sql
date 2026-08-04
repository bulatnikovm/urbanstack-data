-- survey_areas НЕ гарантовано 1:1 по survey_id глобально (див. коментар в
-- _surveys__models.yml — id 431 "Будинкова" волна має 10 area-рядків на один
-- survey). fact_survey_answers припускає рівно 1 area на survey в межах
-- КЛАСИФІКОВАНИХ хвиль (int_survey_waves) — цей тест ловить порушення цього
-- припущення ДО того, як воно тихо розмножить рядки в fact/mart.
-- Провал тесту = нову хвилю в survey_wave_catalog додали, а вона має multi-area
-- дизайн — треба переглянути join у fact_survey_answers, не просто заглушити тест.

select
    a.survey_id,
    count(*) as area_rows
from {{ ref('stg_dim9000__survey_areas') }} a
inner join {{ ref('int_survey_waves') }} w on w.survey_id = a.survey_id
group by a.survey_id
having count(*) > 1
