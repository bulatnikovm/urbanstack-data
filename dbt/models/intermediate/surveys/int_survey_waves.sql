-- Класифікація "реальних" хвиль опитувань (INNER JOIN allowlist — seed
-- survey_wave_catalog.csv) і відсікання тестових/дев-опитувань, які живуть в
-- тому самому id-просторі surveys (напр. "Тест CSat iOS", "Diia Підпис" тести).
-- Grain: один рядок = один survey_id (НЕ агрегація по хвилі — це в dim_survey_wave).
--
-- Місяць в wave_label — укр. скорочення за конвенцією, вже вживаною в
-- audit_operational_dashboard_vs_analytical_panel.md (жовт/лист/груд/січ/лют/бер/квіт/трав).
--
-- wave_label включає діапазон id (напр. "Охорона лип. 2026 (384-401)") —
-- на прохання Микити, щоб діапазон був видно прямо в дропдауні Looker, без
-- окремого звірення з dim_survey_wave.

with surveys as (
    select * from {{ ref('stg_dim9000__surveys') }}
),

catalog as (
    select * from {{ ref('survey_wave_catalog') }}
)

select
    s.survey_id,
    s.wave_description,
    c.survey_category_ua,
    s.status,
    s.started_at,
    s.finished_at,
    date_trunc(date(s.started_at), month) as wave_month,
    concat(
        c.survey_category_ua, ' ',
        case extract(month from s.started_at)
            when 1 then 'січ.' when 2 then 'лют.' when 3 then 'бер.'
            when 4 then 'квіт.' when 5 then 'трав.' when 6 then 'черв.'
            when 7 then 'лип.' when 8 then 'серп.' when 9 then 'вер.'
            when 10 then 'жовт.' when 11 then 'лист.' when 12 then 'груд.'
        end,
        ' ', cast(extract(year from s.started_at) as string),
        ' (',
        cast(min(s.survey_id) over (partition by c.survey_category_ua, date_trunc(date(s.started_at), month)) as string),
        '-',
        cast(max(s.survey_id) over (partition by c.survey_category_ua, date_trunc(date(s.started_at), month)) as string),
        ')'
    ) as wave_label
from surveys s
inner join catalog c on c.wave_description = s.wave_description
where s.survey_type = 'csat'
  and s.status in ('completed', 'processing')
