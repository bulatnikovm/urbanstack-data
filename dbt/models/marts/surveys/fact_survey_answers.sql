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
--
-- ── Будинок відповіді: респондент як пріоритет, area як fallback ───────────
-- survey_areas.house_id — НЕ надійне джерело істини, навіть коли заповнене.
-- Перевірено напряму в BigQuery (2026-08-11) на рядках, де є ОБИДВА сигнали
-- (area.house_id і будинок респондента) — вони РОЗХОДЯТЬСЯ: 38.6% (17 з 44)
-- для Охорони, 48.3% (198 з 409) для Прибудинкова/Будинкова серп.2026. Тобто
-- area — не менш шумне джерело, ніж просто відсутнє (0% черв.2026, 58%
-- серп.2026 заповнено).
--
-- Микита підтвердив бізнес-логіку: людина оцінює те, що бачить У СВОЄМУ
-- будинку (охорону, прибудинкову територію, обслуговування) — "де живе
-- респондент" і Є тим, що коментар описує, для ВСІХ трьох категорій, не
-- лише Прибудинкова/Будинкова. Тому пріоритет — будинок РЕСПОНДЕНТА
-- (survey_answers.user_id → int_user_space_links), area.house_id — лише
-- fallback, коли респондента не вдалось прив'язати до жодного приміщення.
-- Покриття будинком респондента: 99.8-99.9% для всіх трьох категорій.

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

-- Один будинок на респондента: перевага житлу над комерцією/паркінгом, далі
-- найстаріший будинок, далі house_id для детермінованості — той самий
-- tie-break, що й primary_complex в int_user_exclusions.sql.
user_house as (
    select
        user_id,
        house_id
    from {{ ref('int_user_space_links') }}
    qualify row_number() over (
        partition by user_id
        order by is_apartment desc, house_created_at asc, house_id asc
    ) = 1
),

houses as (
    select * from {{ ref('dim_house') }}
),

complexes as (
    select * from {{ ref('dim_complex') }}
),

resolved as (
    select
        a.answer_id,
        a.survey_id,
        a.grade,
        a.comment,
        a.answered_at,
        w.wave_label,
        w.survey_category_ua,
        w.wave_month,
        ar.complex_id as area_complex_id,
        ar.area_type,
        coalesce(uh.house_id, ar.house_id) as resolved_house_id
    from answers a
    inner join waves w on w.survey_id = a.survey_id
    left join areas ar on ar.survey_id = a.survey_id
    left join user_house uh on uh.user_id = a.user_id
)

select
    r.answer_id,
    r.survey_id,
    r.wave_label,
    r.survey_category_ua,
    r.wave_month,
    coalesce(h.complex_id, r.area_complex_id) as complex_id,
    coalesce(h.complex_name, c.complex_name) as complex_name,
    r.resolved_house_id as house_id,
    h.house_number,
    h.street,
    h.house_address,
    r.area_type,
    r.grade,
    nullif(trim(r.comment), '') as comment,
    nullif(trim(r.comment), '') is not null as has_comment,
    r.answered_at
from resolved r
left join houses h on h.house_id = r.resolved_house_id
left join complexes c on c.complex_id = r.area_complex_id
-- Тестовий ЖК (seed test_complexes, тобто DIM 9000) виключений — як і в
-- продуктовому та операційному доменах. Досі опитування були єдиним місцем,
-- де він лишався в цифрах: 34 голоси з 5 057 (0,7%), але в інтегральному
-- рейтингу ЖК він ставав на 2-ге місце й виглядав як реальний клієнт.
where not coalesce(h.is_test_complex, c.is_test_complex, false)
