-- Grain: одна відповідь NPS (answer_id).
--
-- ── Шкала ─────────────────────────────────────────────────────────────────
-- У застосунку шкала 1-10, не канонічна 0-10 (перевірено на даних:
-- min(grade)=1, max(grade)=10). Класичний розподіл лишається тим самим —
-- 9-10 промоутери, 7-8 пасивні, решта детрактори, — просто нижня межа
-- детракторів починається з 1, а не з 0. Це НЕ робить бал непорівнянним із
-- ринковими бенчмарками у верхній частині (промоутери визначені однаково),
-- але зсуває низ: у нас нема способу поставити 0.
--
-- ── ЖК береться з опитування, а не з респондента ──────────────────────────
-- Протилежно до fact_survey_answers (CSAT), де будинок резолвиться через
-- респондента. Причина: NPS-хвиля розсилається ПО ЖК — рівно одне
-- опитування на ЖК, — тож area.complex_id тут не шумне поле, а сам дизайн
-- розсилки. Будинок респондента лишається окремою колонкою для розрізу
-- «по будинках», але приналежність до ЖК визначає опитування.
--
-- Тестові опитування відсіяні на рівні int_nps_waves (усі жили в ЖК
-- DIM 9000).

with answers as (
    select * from {{ ref('stg_dim9000__survey_answers') }}
),

waves as (
    select * from {{ ref('int_nps_waves') }}
),

-- Один будинок на респондента — той самий tie-break, що в
-- fact_survey_answers і int_user_exclusions.
user_house as (
    select user_id, house_id
    from {{ ref('int_user_space_links') }}
    qualify row_number() over (
        partition by user_id
        order by is_apartment desc, house_created_at asc, house_id asc
    ) = 1
),

houses as (
    select * from {{ ref('dim_house') }}
)

select
    a.answer_id,
    a.survey_id,
    w.wave_label,
    w.wave_month,
    w.complex_id,
    w.complex_name,
    uh.house_id,
    h.house_number,
    h.house_address,
    a.grade,
    a.grade >= 9                              as is_promoter,
    a.grade between 7 and 8                   as is_passive,
    a.grade <= 6                              as is_detractor,
    case
        when a.grade >= 9 then 'Промоутери'
        when a.grade >= 7 then 'Пасивні'
        else 'Детрактори'
    end                                        as nps_band_ua,
    nullif(trim(a.comment), '')                as comment,
    nullif(trim(a.comment), '') is not null    as has_comment,
    a.answered_at
from answers a
join waves w      on w.survey_id = a.survey_id
left join user_house uh on uh.user_id = a.user_id
left join houses h      on h.house_id = uh.house_id
