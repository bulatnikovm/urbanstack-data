-- Відповіді на опитування. Джерело: postgresqldim9000.survey_answers.
-- optionid не вибираємо — для type='csat' завжди NULL (перевірено: 0 рядків
-- survey_options на csat-опитуваннях), не потрібен для voting-марту.

select
    id          as answer_id,
    surveyid    as survey_id,
    userid      as user_id,
    grade,
    comment,
    createdat   as answered_at
from {{ source('postgresqldim9000_surveys', 'survey_answers') }}
