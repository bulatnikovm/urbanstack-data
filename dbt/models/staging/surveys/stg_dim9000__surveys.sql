-- Опитування. Джерело: postgresqldim9000.surveys.

select
    id              as survey_id,
    description     as wave_description,
    type            as survey_type,
    respondenttype  as respondent_type,
    status,
    startdate       as started_at,
    finishdate      as finished_at,
    createdat       as created_at,
    updatedat       as updated_at
from {{ source('postgresqldim9000_surveys', 'surveys') }}
