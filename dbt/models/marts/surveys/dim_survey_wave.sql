-- Довідник хвиль опитувань, grain = wave_label. Джерело дропдауна у Looker +
-- явна документація "діапазону id" (min/max survey_id) з оригінального запиту.

select
    wave_label,
    survey_category_ua,
    wave_month,
    min(survey_id) as min_survey_id,
    max(survey_id) as max_survey_id,
    count(*) as survey_count,
    any_value(status) as status  -- статус уніфікований в межах хвилі (перевірено на реальних даних)
from {{ ref('int_survey_waves') }}
group by wave_label, survey_category_ua, wave_month
order by wave_month desc
