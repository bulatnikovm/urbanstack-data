-- КРИВА ПІДКЛЮЧЕННЯ. Грануляція: complex_id × day_offset (0-90).
--
-- Відповідає на питання, на яке помісячні вітрини відповісти не можуть:
-- «наш новий ЖК на третій день — це нормально чи погано?»
--
-- ── Чому вісь не календарна ──────────────────────────────────────────────
-- Сторінка `/adoption` побудована на зрілих когортах: частка показується,
-- лише коли 30-денне вікно минуло щонайменше у 80% когорти місяця. Для ЖК,
-- який підключається ЗАРАЗ, це означає порожньо — невидимими стають рівно ті
-- перші тижні, на які ще можна вплинути. Тут вісь — ДНІ ВІД ЗАВЕДЕННЯ
-- РАХУНКУ, тому крива нового ЖК читається з першого дня й лягає поруч із
-- історичною кривою портфеля в тому самому віці.
--
-- ── Знаменник рухається разом із віссю ───────────────────────────────────
-- На кожному зсуві N у знаменник входять ТІЛЬКИ ті, кому рахунок завели
-- щонайменше N днів тому. Інакше людина, заведена вчора, потрапляла б у
-- знаменник «частка за 30 днів» і тягнула його вниз просто тому, що її 30
-- днів ще не минули. Це та сама помилка, від якої на сторінці стоїть
-- MIN_COVERAGE, — тільки тут вона знята за побудовою, а не порогом.
--
-- ⚠️ Лічильники, а не частки: кожна людина належить рівно одному ЖК
-- (основне приміщення), тому `cohort_eligible` і `opened_by` можна
-- складати по ЖК і отримувати портфель. Частку складати не можна — її
-- рахує дашборд із суми.
--
-- ⚠️ Тільки `is_measurable`: дата реєстрації наближається ПЕРШОЮ ПОДІЄЮ в
-- Amplitude, і для рахунків, заведених до 2024-01, це дало б «першу подію»
-- у 2024-му незалежно від того, коли людина справді зайшла.

{% set max_offset = 90 %}

with people as (
    select
        complex_id,
        provisioned_date,
        days_to_first_event,
        date_diff(current_date(), provisioned_date, day)            as age_days
    from {{ ref('int_user_adoption') }}
    where is_measurable
      and is_active_resident
      and complex_id is not null

      -- ⚠️ Тестовий ЖК доводиться відсікати ТУТ, а не покладатись на
      -- `is_active_resident`. У `int_user_adoption` десять акаунтів DIM 9000
      -- проходять як активні мешканці без причини виключення: модель бере
      -- ОСТАННІЙ місяць людини з `int_user_exclusions`, і в ньому вони не
      -- позначені. У `mart_user_base_monthly` і помісячній воронці цієї
      -- діри немає — вони читають `int_user_base_monthly`. Без фільтра
      -- DIM 9000 ставав рядком рейтингу з кривою 80%, тобто виглядав як
      -- найкращий ЖК портфеля (те саме, що вже ловили в опитуваннях, §8е).
      and complex_id not in (select complex_id from {{ ref('test_complexes') }})
),

offsets as (
    select day_offset
    from unnest(generate_array(0, {{ max_offset }})) as day_offset
),

grid as (
    select
        p.complex_id,
        o.day_offset,

        -- Людина потрапляє у знаменник зсуву N, лише якщо її рахунку вже
        -- щонайменше N днів: інакше ми питаємо про майбутнє.
        p.age_days >= o.day_offset                                  as is_eligible,

        -- І в чисельник — якщо відкрила застосунок не пізніше N-го дня.
        p.age_days >= o.day_offset
          and p.days_to_first_event is not null
          and p.days_to_first_event <= o.day_offset                 as has_opened_by

    from people as p
    cross join offsets as o
)

select
    g.complex_id,
    c.complex_name,
    g.day_offset,
    countif(g.is_eligible)                                          as cohort_eligible,
    countif(g.has_opened_by)                                        as opened_by
from grid as g
inner join {{ ref('dim_complex') }} as c on c.complex_id = g.complex_id
group by g.complex_id, c.complex_name, g.day_offset
