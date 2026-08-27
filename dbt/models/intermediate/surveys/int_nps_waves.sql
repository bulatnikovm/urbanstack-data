-- Хвилі NPS. Сусід int_survey_waves (CSAT), але з іншим способом
-- відсіювання тестових опитувань і без категорій.
--
-- ── Чому не так, як у CSAT ────────────────────────────────────────────────
--
-- CSAT-хвилі класифікуються за ключовим словом в описі (Охорона /
-- Прибудинкова / Будинкова), і тестові опитування відсіюються тим, що
-- жодного ключового слова не містять. У NPS питання ОДНЕ на всі ЖК
-- («Нам важливо знати вашу думку про проживання та обслуговування в ЖК»),
-- категорій немає — класифікувати нічого.
--
-- Натомість тут працює простіший і надійніший фільтр: УСІ 25 тестових
-- NPS-опитувань (2025-08 … 2026-08: «Test NPS 1-3», «Evgen NPS», «Тест
-- пуші», «Варіант 1», «Csat Test» тощо) створені в тестовому ЖК DIM 9000, і
-- всі 20 відповідей на них — теж звідти. Тобто seed `test_complexes`
-- відсікає їх повністю, без жодного списку заборонених описів, який
-- довелось би доповнювати після кожного релізу.
--
-- Грануляція — survey_id (по одному опитуванню на ЖК). Хвиля = місяць
-- старту; діапазон id у мітці — та сама конвенція, що в CSAT, щоб у
-- фільтрі було видно, які саме опитування зведені.
--
-- status: беремо і 'completed', і 'processing' — жива хвиля (стартувала
-- 2026-08-25, фінішує 30.10) саме в processing, і чекати її закриття, щоб
-- показати цифри, немає сенсу.

with surveys as (
    select * from {{ ref('stg_dim9000__surveys') }}
    where survey_type = 'nps'
      and status in ('completed', 'processing')
),

-- Одна area на опитування — той самий захист від fan-out, що й у
-- fact_survey_answers (сирі дані 1:1 не гарантують).
areas as (
    select *
    from {{ ref('stg_dim9000__survey_areas') }}
    qualify row_number() over (partition by survey_id order by area_id) = 1
),

complexes as (
    select * from {{ ref('dim_complex') }}
)

select
    s.survey_id,
    s.wave_description,
    s.status,
    s.started_at,
    s.finished_at,
    a.complex_id,
    c.complex_name,
    date_trunc(date(s.started_at), month) as wave_month,
    concat(
        'NPS ',
        case extract(month from s.started_at)
            when 1 then 'січ.' when 2 then 'лют.' when 3 then 'бер.'
            when 4 then 'квіт.' when 5 then 'трав.' when 6 then 'черв.'
            when 7 then 'лип.' when 8 then 'серп.' when 9 then 'вер.'
            when 10 then 'жовт.' when 11 then 'лист.' when 12 then 'груд.'
        end,
        ' ', cast(extract(year from s.started_at) as string),
        ' (',
        cast(min(s.survey_id) over (partition by date_trunc(date(s.started_at), month)) as string),
        '-',
        cast(max(s.survey_id) over (partition by date_trunc(date(s.started_at), month)) as string),
        ')'
    ) as wave_label
from surveys s
join areas a     on a.survey_id  = s.survey_id
join complexes c on c.complex_id = a.complex_id
where not c.is_test_complex
