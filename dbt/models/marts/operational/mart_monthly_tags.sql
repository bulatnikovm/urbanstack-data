-- Grain: complex_id × report_month × category_ua × type_ua × tag_set.
-- Дзеркало mart_monthly_categories з ОДНИМ додатковим виміром — НАБОРОМ
-- тегів CRM, які висять на заявці.
--
-- ── Чому набір, а не тег ──────────────────────────────────────────────────
-- Тег БАГАТОЗНАЧНИЙ, і перша версія моделі робила з нього звичайний вимір:
-- рядок на кожну пару «заявка × тег». Виглядало природно й було неправильно
-- — фільтр на дашборді фільтрує РЯДОК, а питання людини стосується ЗАЯВКИ.
--
-- Микола (ANA-10, 2026-08-31): «крім Забудовник» показувало більше заявок,
-- ніж є насправді. Заявка з мітками «Забудовник» + «заплановано 30+» давала
-- два рядки, виключення прибирало лише перший, і вона лишалась у цифрі через
-- другий. А таких там більшість: із 215 заявок з тегом «Забудовник» за 2026
-- рік 153 мають ще якийсь тег. Плюс той самий рядок-на-тег завищував будь-яку
-- суму по зрізу, навіть без виключень.
--
-- Масштаб на зрізі з тікета (2026, крім категорій «Фінансові питання» й
-- «Охорона», типи Проблема/Скарга/Послуга): створено 14 995, з тегом
-- «Забудовник» 180, отже «крім Забудовник» = 14 815 — рівно те, що рахував
-- Микола вручну. Стара модель віддавала 15 298.
--
-- Тому вимір тепер — НАБІР тегів заявки одним значенням («Забудовник|
-- заплановано 30+»), а не кожен тег окремо. Кожна заявка присутня в моделі
-- РІВНО ОДИН раз, як і в mart_monthly_categories, і будь-яка сума по зрізу
-- порівнянна із загальною цифрою. Наборів на всю базу 52 — вимір лишається
-- дрібним, а розбір на окремі теги робить дашборд (він і так має відповідати
-- на питання «усі обрані» / «жодного з обраних», а не «цей рядок»).
--
-- ⚠️ Роздільник «|»: жоден тег CRM його не містить, і на це стоїть тест
-- у stg_dim9000__tags. Зʼявиться тег з «|» в назві — набір розпадеться на
-- дашборді мовчки, тому тест саме там, а не тут.
--
-- ── «Без тега» — повноцінне значення виміру ──────────────────────────────
-- Заявка без жодної мітки дає набір `Без тега`. Без цього «крім Забудовник»
-- означало б «усе, що має якийсь ІНШИЙ тег», а покриття тегами низьке (їх
-- почали проставляти в 2025-му) — мовчки випадала б більшість заявок.
--
-- Лічильники й спосіб їх рахунку — байт-у-байт як у mart_monthly_categories
-- (створено по created_at, виконано/скасовано по closed_at), щоб цифра «за
-- тегом X» була порівнянна з цифрою «загалом», а не жила за власними
-- правилами.

with orders as (
    select * from {{ ref('fact_orders') }}
    where not coalesce(is_test_complex, false)
      and complex_id is not null
      -- Групова заявка рахується ОДИН раз — батьком (рішення Максима
      -- 2026-08-26, деталі й масштаб — у шапці fact_orders).
      and not is_child
),

tagged as (
    select
        o.*,
        -- `fact_orders.tags` уже відсортований (array_agg ... order by), тож
        -- той самий набір тегів завжди дає той самий рядок — інакше «А|Б» і
        -- «Б|А» стали б двома різними значеннями виміру.
        --
        -- `coalesce` навколо array_length обовʼязковий: для NULL-масиву він
        -- повертає NULL, і порівняння `= 0` було б невизначеним.
        array_to_string(
            if(coalesce(array_length(o.tags), 0) = 0, ['Без тега'], o.tags),
            '|'
        ) as tag_set
    from orders o
),

created as (
    select
        complex_id,
        date_trunc(date(created_at), month) as report_month,
        category_ua,
        type_ua,
        tag_set,
        count(*) as created_count,
        countif(is_valid) as valid_created_count
    from tagged
    group by complex_id, report_month, category_ua, type_ua, tag_set
),

closed as (
    select
        complex_id,
        date_trunc(date(closed_at), month) as report_month,
        category_ua,
        type_ua,
        tag_set,
        countif(is_valid) as completed_count,
        countif(not is_valid) as canceled_count,
        countif(is_valid and date_trunc(date(created_at), month) = date_trunc(date(closed_at), month))
            as completed_same_month_count
    from tagged
    where closed_at is not null
    group by complex_id, report_month, category_ua, type_ua, tag_set
)

select
    coalesce(cr.complex_id, cl.complex_id)     as complex_id,
    coalesce(cr.report_month, cl.report_month) as report_month,
    coalesce(cr.category_ua, cl.category_ua)   as category_ua,
    coalesce(cr.type_ua, cl.type_ua)           as type_ua,
    coalesce(cr.tag_set, cl.tag_set)           as tag_set,
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
  and cl.tag_set      = cr.tag_set
