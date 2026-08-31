-- Grain: complex_id × report_month × category_ua × type_ua × tag_ua.
-- Дзеркало mart_monthly_categories з ОДНИМ додатковим виміром — тегом CRM.
--
-- Навіщо окрема модель, а не колонка в mart_monthly_categories: тег
-- БАГАТОЗНАЧНИЙ. Заявка з мітками «Аварійна» і «Терміново» — це одна
-- заявка, але два рядки тут. Якби тег став частиною основної моделі,
-- будь-яка сума без фільтра по тегу мовчки рахувала б такі заявки двічі.
-- Тому розділення жорстке: без фільтра по тегу сторінка читає
-- mart_monthly_categories (кожна заявка рівно раз), з фільтром — цю модель
-- (рядки одного тега між собою не перетинаються).
--
-- Лічильники й спосіб їх рахунку — байт-у-байт як у mart_monthly_categories
-- (створено по created_at, виконано/скасовано по closed_at), щоб цифра «за
-- тегом X» була порівнянна з цифрою «загалом», а не жила за власними
-- правилами.
--
-- ── «Без тега» — повноцінне значення виміру ──────────────────────────────
-- Спершу модель містила ТІЛЬКИ затеговані заявки, і це виявилось пасткою.
-- Микола (2026-08-31) обрав «усі теги, крім Забудовник» і отримав цифри,
-- менші за реальні в рази: «за бортом лишаються звернення без тегів». І він
-- має рацію — «крім Забудовник» людською мовою означає «усе, що не
-- Забудовник», а не «усе, що має якийсь ІНШИЙ тег». Покриття тегами низьке
-- (їх почали проставляти в 2025-му), тож мовчки випадала більшість заявок.
--
-- Тому заявка без жодного тега тепер дає рядок з `tag_ua = 'Без тега'`.
-- Вимір став ПОВНИМ: кожна заявка присутня хоча б одним рядком, і будь-яке
-- виключення лишає її в цифрі, поки не виключили саме її тег.
--
-- ⚠️ Сума по ВСІХ тегах усе одно більша за кількість заявок — заявка з
-- двома мітками дає два рядки. Це властивість багатозначного виміру, а не
-- баг: без фільтра по тегу сторінка читає mart_monthly_categories, де
-- кожна заявка рівно раз.

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
      and complex_id is not null
      -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
      -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
      and not is_child
),

tagged as (
    select o.*, tag_ua
    from orders o,
         -- Порожній масив дав би НУЛЬ рядків на заявку (unnest прибирає її
         -- цілком), тому підставляємо явний псевдотег. `coalesce` навколо
         -- array_length обовʼязковий: для NULL-масиву array_length повертає
         -- NULL, і порівняння `= 0` було б невизначеним.
         unnest(
             if(coalesce(array_length(o.tags), 0) = 0, ['Без тега'], o.tags)
         ) as tag_ua
),

created as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        category_ua,
        type_ua,
        tag_ua,
        count(*) as created_count,
        countif(is_valid) as valid_created_count
    from tagged
    group by complex_id, report_month, category_ua, type_ua, tag_ua
),

closed as (
    select
        complex_id,
        date_trunc(date(closed_at), month) as report_month,
        category_ua,
        type_ua,
        tag_ua,
        countif(is_valid) as completed_count,
        countif(not is_valid) as canceled_count,
        countif(is_valid and date_trunc(date(created_at), month) = date_trunc(date(closed_at), month))
            as completed_same_month_count
    from tagged
    where closed_at is not null
    group by complex_id, report_month, category_ua, type_ua, tag_ua
)

select
    coalesce(cr.complex_id, cl.complex_id)     as complex_id,
    coalesce(cr.report_month, cl.report_month) as report_month,
    coalesce(cr.category_ua, cl.category_ua)   as category_ua,
    coalesce(cr.type_ua, cl.type_ua)           as type_ua,
    coalesce(cr.tag_ua, cl.tag_ua)             as tag_ua,
    coalesce(cr.created_count, 0)              as created_count,
    coalesce(cr.valid_created_count, 0)        as valid_created_count,
    coalesce(cl.completed_count, 0)            as completed_count,
    coalesce(cl.canceled_count, 0)             as canceled_count,
    coalesce(cl.completed_same_month_count, 0) as completed_same_month_count
from created cr
full outer join closed cl
  on  cl.complex_id   = cr.complex_id
  and cl.report_month = cr.report_month
  and cl.category_ua  = cr.category_ua
  and cl.type_ua      = cr.type_ua
  and cl.tag_ua       = cr.tag_ua
