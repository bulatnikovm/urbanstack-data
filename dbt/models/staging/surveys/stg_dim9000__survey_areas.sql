-- Прив'язка опитування до об'єкта. Джерело: postgresqldim9000.survey_areas.
-- Один survey = одна area (house АБО complex-wide АБО apartment) — перевірено,
-- fan-out ризику немає.

select
    id          as area_id,
    surveyid    as survey_id,
    type        as area_type,
    complexid   as complex_id,
    houseid     as house_id,
    sectionid   as section_id,
    locationid  as location_id
from {{ source('postgresqldim9000_surveys', 'survey_areas') }}
