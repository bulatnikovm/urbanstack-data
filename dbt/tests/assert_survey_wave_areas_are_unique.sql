{{ config(severity='warn') }}

-- survey_areas НЕ гарантовано 1:1 по survey_id глобально (див. коментар в
-- _surveys__models.yml — id 431 "Будинкова" волна має 10 area-рядків на один
-- survey). fact_survey_answers СВІДОМО дедуплікує areas через QUALIFY
-- ROW_NUMBER() — join безпечний для будь-якої кількості area-рядків.
--
-- 2026-08-11: понижено з error до warn. Раніше тест блокував build, коли
-- 431 потрапляв у вибірку (до фіксу класифікації хвиль він туди не долітав
-- узагалі). Тепер, коли класифікація за ключовими словами регулярно підхоплює
-- нові хвилі, multi-area дизайн — не сюрприз, а очікуваний випадок, який
-- fact-шар уже коректно обробляє. Тест лишається як сигнал: якщо спрацює на
-- ІНШОМУ survey_id — варто вручну перевірити, чи QUALIFY (бере area_id
-- мінімальний) обирає семантично правильну area для цієї конкретної хвилі,
-- а не просто заглушити попередження.

select
    a.survey_id,
    count(*) as area_rows
from {{ ref('stg_dim9000__survey_areas') }} a
inner join {{ ref('int_survey_waves') }} w on w.survey_id = a.survey_id
group by a.survey_id
having count(*) > 1
