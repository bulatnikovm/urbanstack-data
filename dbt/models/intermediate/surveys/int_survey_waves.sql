-- Класифікація "реальних" хвиль опитувань і відсікання тестових/дев-опитувань,
-- які живуть в тому самому id-просторі surveys (напр. "Тест CSat iOS").
-- Grain: один рядок = один survey_id (НЕ агрегація по хвилі — це в dim_survey_wave).
--
-- ── Категорія за ключовими словами, не за точним текстом ───────────────────
-- Раніше тут був allowlist точного тексту (seeds/survey_wave_catalog.csv) —
-- зламався в серпні 2026, коли UrbanStack переформулював питання кварталу
-- ("Оцініть обслуговування прибудинкової території" → "Як вам ваш двір?"):
-- новий текст не збігався буквально зі seed'ом, і 29 реальних survey_id тихо
-- випали з аналітики (виявив Микита). Замінено на класифікацію за ключовими
-- словами в описі — переживає зміну формулювання, доки лишається впізнавана
-- тема. Порядок гілок важливий: "прибудинков" містить підрядок "будинк", тому
-- перевіряємо територію/двір РАНІШЕ за загальний "будинк".
--
-- ⚠️ 2026-08-11: попередній seed мав ЦІ ДВІ КАТЕГОРІЇ ПЕРЕПЛУТАНИМИ (підтвердив
-- Микита — то був баг, не навмисне рішення): текст "…прибудинкової території"
-- мапився на "Будинкова", текст "…обслуговування будинку" — на "Прибудинкова".
-- Тут виправлено на буквальний сенс: територія/двір → Прибудинкова, будинок →
-- Будинкова. Це змінює лейбли і для ІСНУЮЧИХ хвиль (черв. 2026), не тільки
-- нових — очікувано, старий мапінг був помилковим для всіх хвиль однаково.
--
-- Тестові/дев-описи ("Тест CSat", "Evgen CSat", "Варіант 1" тощо) не містять
-- жодного з ключових слів — відсіюються самі, без окремого blocklist'у
-- (перевірено на повній історії wave_description на момент цієї зміни).
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

classified as (
    select
        s.*,
        case
            when regexp_contains(lower(s.wave_description), r'охорон')
                then 'Охорона'
            when regexp_contains(lower(s.wave_description), r'двір|двор|територ|прибудинков')
                then 'Прибудинкова'
            when regexp_contains(lower(s.wave_description), r'будинк')
                then 'Будинкова'
        end as survey_category_ua
    from surveys s
    where s.survey_type = 'csat'
      and s.status in ('completed', 'processing')
)

select
    survey_id,
    wave_description,
    survey_category_ua,
    status,
    started_at,
    finished_at,
    date_trunc(date(started_at), month) as wave_month,
    concat(
        survey_category_ua, ' ',
        case extract(month from started_at)
            when 1 then 'січ.' when 2 then 'лют.' when 3 then 'бер.'
            when 4 then 'квіт.' when 5 then 'трав.' when 6 then 'черв.'
            when 7 then 'лип.' when 8 then 'серп.' when 9 then 'вер.'
            when 10 then 'жовт.' when 11 then 'лист.' when 12 then 'груд.'
        end,
        ' ', cast(extract(year from started_at) as string),
        ' (',
        cast(min(survey_id) over (partition by survey_category_ua, date_trunc(date(started_at), month)) as string),
        '-',
        cast(max(survey_id) over (partition by survey_category_ua, date_trunc(date(started_at), month)) as string),
        ')'
    ) as wave_label
from classified
where survey_category_ua is not null
