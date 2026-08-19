-- Grain: complex_id. Інтегральна оцінка ЖК — центральна таблиця звіту CSAT.
--
-- Відтворює лист «Динаміка» ручного xlsx-звіту:
--   Інтегральний УК      = середня «Прибудинкова» + середня «Будинкова»
--   Інтегральний загальний = Інтегральний УК + середня «Охорона»
--   Рейтинг              = місце за Інтегральним УК (спадання)
--
-- Так, це СУМА середніх, а не середня — показник у діапазоні 0-10 (УК) і
-- 0-15 (загальний), а не 1-5. Формула авторська (Микита), лишаємо як є:
-- сенс у тому, що ЖК має бути добрим за ВСІМА напрямками одразу, і провал
-- в одному не компенсується успіхом в іншому так, як його згладила б
-- звичайна середня.
--
-- Чому рейтинг за УК, а не за загальним: охорона — це підрядник, якого
-- міняють, а прибудинкова територія і будинок — власна робота компанії.
-- У xlsx рейтинг теж рахувався саме за УК (перевірено: порядок місць
-- 1-10 збігається з сортуванням за Інтегральним УК, а не за загальним —
-- «Правий берег» з 5.84 стоїть вище за «Варшавський» з 9.25 загального).
--
-- ⚠️ Відмінність від замороженого xlsx: беремо ОСТАННЮ хвилю кожної
-- категорії, а xlsx брав передостанню «Охорону» (липнева була ще
-- «проміжна», незавершена). Тепер вона завершена, тож фіксувати вибір
-- руками не треба — модель сама їде за свіжістю.

with summary as (
    select * from {{ ref('mart_survey_wave_summary') }}
),

-- ⚠️ `wave_sort_id` у mart_survey_wave_summary — це min(survey_id) на РЯДОК
-- (хвиля × ЖК × будинок), а не на хвилю: у межах однієї хвилі він різний для
-- різних будинків. Назва обіцяє більше, ніж поле дає. Тому спершу зводимо
-- його до справжнього ключа хвилі — min по wave_label.
wave_keys as (
    select wave_label, survey_category_ua, min(wave_sort_id) as wave_key
    from summary
    group by wave_label, survey_category_ua
),

-- Остання хвиля кожної категорії — по всьому портфелю, а не по ЖК:
-- хвиля запускається одна на всіх, і якщо в ЖК за неї ніхто не проголосував,
-- це «немає оцінки», а не «беремо стару».
latest_waves as (
    select survey_category_ua, wave_label
    from wave_keys
    qualify row_number() over (
        partition by survey_category_ua order by wave_key desc
    ) = 1
),

by_category as (
    select
        s.complex_id,
        s.complex_name,
        s.survey_category_ua,
        any_value(s.wave_label) as wave_label,
        sum(s.votes) as votes,
        sum(s.comments) as comments,
        safe_divide(sum(s.grade_sum), nullif(sum(s.votes), 0)) as avg_grade,
        sum(s.grade_1 + s.grade_2) as low_grades
    from summary s
    join latest_waves lw
      on lw.survey_category_ua = s.survey_category_ua
     and lw.wave_label = s.wave_label
    group by s.complex_id, s.complex_name, s.survey_category_ua
),

pivoted as (
    select
        complex_id,
        any_value(complex_name) as complex_name,
        max(if(survey_category_ua = 'Прибудинкова', avg_grade, null)) as avg_adjacent,
        max(if(survey_category_ua = 'Будинкова',    avg_grade, null)) as avg_building,
        max(if(survey_category_ua = 'Охорона',      avg_grade, null)) as avg_security,
        max(if(survey_category_ua = 'Прибудинкова', wave_label, null)) as wave_adjacent,
        max(if(survey_category_ua = 'Будинкова',    wave_label, null)) as wave_building,
        max(if(survey_category_ua = 'Охорона',      wave_label, null)) as wave_security,
        sum(votes) as votes_latest,
        sum(comments) as comments_latest,
        sum(low_grades) as low_grades_latest
    from by_category
    group by complex_id
),

-- Участь рахується від ЖИВОГО інвентарю, а не від статичного «Довідника ЖК»
-- з xlsx: рахунки й підтверджені користувачі беруться з операційного mart'у
-- за останній місяць. Одна цифра — одне джерело.
audience as (
    select
        complex_id,
        n_billing_accounts,
        n_users_confirmed
    from {{ ref('mart_monthly_complex_overview') }}
    qualify row_number() over (partition by complex_id order by report_month desc) = 1
),

all_time as (
    select
        complex_id,
        sum(votes) as votes_all_time,
        sum(comments) as comments_all_time,
        safe_divide(sum(grade_sum), nullif(sum(votes), 0)) as avg_grade_all_time,
        sum(grade_1 + grade_2) as low_grades_all_time
    from summary
    group by complex_id
)

select
    p.complex_id,
    p.complex_name,
    p.avg_adjacent,
    p.avg_building,
    p.avg_security,
    p.wave_adjacent,
    p.wave_building,
    p.wave_security,
    -- NULL, а не 0, якщо хоч однієї складової немає: сума з дірою — це не
    -- «погано», це «немає даних», і ставити такий ЖК у рейтинг не можна.
    p.avg_adjacent + p.avg_building                    as integral_uk,
    p.avg_adjacent + p.avg_building + p.avg_security   as integral_total,
    rank() over (order by (p.avg_adjacent + p.avg_building) desc nulls last) as rating_uk,
    p.votes_latest,
    p.comments_latest,
    p.low_grades_latest,
    a.votes_all_time,
    a.comments_all_time,
    a.avg_grade_all_time,
    a.low_grades_all_time,
    au.n_billing_accounts,
    au.n_users_confirmed,
    safe_divide(p.votes_latest, nullif(au.n_billing_accounts, 0)) as reach_of_accounts,
    safe_divide(p.votes_latest, nullif(au.n_users_confirmed, 0))  as reach_of_confirmed
from pivoted p
left join all_time a  on a.complex_id  = p.complex_id
left join audience au on au.complex_id = p.complex_id
