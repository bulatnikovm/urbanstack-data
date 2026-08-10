-- Grain: wave_label × complex_id × house_id (house_id NULL для complex-wide
-- відповідей — "Охорона" опитується на рівні ЖК, не будинку, це нормально).
-- Аналог листів "Дані DIM 9000"/"Дані Гардіан" xlsx (по домах) — Looker
-- агрегує вгору до ЖК для "Динаміка"-еквіваленту.
--
-- ⚠️ grade_sum замість готового avg_grade — Looker Studio при re-агрегації
-- (напр. групування тільки по ЖК, без house_number) СУМУЄ числові поля, не
-- усереднює. Якщо віддати готовий avg_grade — Looker підсумує середні по
-- будинках і покаже сміття (напр. 25 замість очікуваних 1-5). Правильно —
-- рахувати середню в Looker як calculated field `SUM(grade_sum)/SUM(votes)`,
-- це коректно переагрегується на будь-якому рівні групування.
-- house_number: NULL замінено на явний лейбл — інакше Looker показує
-- буквальний текст "null" в таблиці, що виглядає як помилка, а не дизайн.
--
-- wave_sort_id: min(survey_id) хвилі — хронологічний ключ сортування колонок
-- у зведеній таблиці Looker. wave_label текстово НЕ сортується хронологічно
-- впереміш між категоріями (напр. "Прибудинкова" і "Охорона" перемежовуються
-- за алфавітом/групуванням, а не за часом) — сортування по wave_sort_id
-- (зростання) дає справжню хронологію незалежно від категорії.

select
    wave_label,
    survey_category_ua,
    wave_month,
    complex_id,
    complex_name,
    house_id,
    coalesce(house_number, 'ЖК загалом') as house_number,
    min(survey_id) as wave_sort_id,
    count(*) as votes,
    countif(has_comment) as comments,
    sum(grade) as grade_sum,
    countif(grade = 5) as grade_5,
    countif(grade = 4) as grade_4,
    countif(grade = 3) as grade_3,
    countif(grade = 2) as grade_2,
    countif(grade = 1) as grade_1
from {{ ref('fact_survey_answers') }}
group by wave_label, survey_category_ua, wave_month, complex_id, complex_name, house_id, house_number
