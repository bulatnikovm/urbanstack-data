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
-- ── Будинок відповіді: area як пріоритет, респондент як fallback ───────────
-- survey_areas.house_id — НЕ надійне єдине джерело: перевірено напряму в
-- BigQuery (2026-08-11) — для хвилі черв.2026 (Прибудинкова/Будинкова)
-- house_id/location_id ПОРОЖНІ у 100% area-рядків (0 з 19), для серп.2026 —
-- заповнені лише в 58% (11 з 19). Микита підказав робочий обхідний шлях зі
-- старого xlsx-процесу: дивитись не на area опитування, а на будинок самого
-- РЕСПОНДЕНТА (survey_answers.user_id → int_user_space_links). Перевірено:
-- це дає 1329 з 1330 (99.9%) для черв.2026 замість 0%.
--
-- Fallback застосовується ЛИШЕ для Прибудинкова/Будинкова — респондент оцінює
-- своє житло, тому "де живе" ≈ "що оцінює". Для Охорона це не так (оцінюється
-- охорона ЖК/паркінгу, не житло респондента) — там свідомо лишаємо як є,
-- house_id тільки якщо area його реально дає (напр. окремий паркінг-будинок).

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
        case
            when w.survey_category_ua in ('Прибудинкова', 'Будинкова')
                then coalesce(ar.house_id, uh.house_id)
            else ar.house_id
        end as resolved_house_id
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
