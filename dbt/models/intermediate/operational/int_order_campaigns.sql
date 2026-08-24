-- Grain: заявка (order_id), тільки ті, що входять у кампанію.
--
-- Детектор скоординованої кампанії мешканців. Це найсильніший знайдений
-- сигнал: історично кампанії передували виходу будинків (Севен, березень
-- 2024, «вимога перегляду тарифу», 22 людини — обидва будинки пішли;
-- Варшавський Плюс, листопад 2024, котельня, 13 людей — обидва пішли).
--
-- Правило: >= 3 РІЗНИХ мешканці (citizen_id) І >= 3 РІЗНИХ автори записи
-- (created_by_id) одного ЖК подають заявки з однаковими першими 45 символами
-- нормалізованого тексту, з розривом не більше 14 днів між сусідніми.
--
-- Друга умова (різні автори) — не дублікат першої, вона критична: без неї
-- детектор забивається диспетчерськими шаблонами («Продублювати актуальні
-- квитанції на пошту …»), де citizen_id різні, а пише їх один оператор.
-- З нею з 281 «кампанії» лишається 109 справжніх.
--
-- Сесіонізація по розриву >14 днів, а не фіксовані двотижневі бакети:
-- бакети розрізали б кампанію, що йде через межу.
--
-- Поріг 45 символів підібраний по даних: кампанії «Грейт» 2025-05-02
-- переказані своїми словами, але перші речення збігаються дослівно.
-- Коротший префікс склеює різні теми, довший — губить перефразування.

with flagged as (
    select
        f.order_id,
        f.citizen_id,
        f.created_by_id,
        f.created_at,
        f.text_prefix45,
        f.text_norm,
        f.is_escalation,
        f.is_legal,
        f.is_collective,
        f.is_osbb_intent,
        o.complex_id,
        o.complex_name,
        o.house_id,
        o.house_number,
        o.category_ua,
        date(f.created_at) as order_date
    from {{ ref('int_order_text_flags') }} f
    join {{ ref('fact_orders') }} o using (order_id)
    where f.text_length >= 60          -- короткі заявки збігаються випадково
      and o.complex_id is not null
      and not coalesce(o.is_test_complex, false)
),

-- розрив >14 днів між сусідніми заявками з тим самим текстом = нова кампанія
gapped as (
    select
        *,
        coalesce(
            date_diff(
                order_date,
                lag(order_date) over (
                    partition by complex_id, text_prefix45 order by order_date, order_id
                ),
                day
            ) > 14,
            true
        ) as is_new_session
    from flagged
),

sessionized as (
    select
        *,
        countif(is_new_session) over (
            partition by complex_id, text_prefix45
            order by order_date, order_id
            rows between unbounded preceding and current row
        ) as session_no
    from gapped
),

qualified as (
    select
        complex_id,
        text_prefix45,
        session_no
    from sessionized
    group by 1, 2, 3
    having count(distinct citizen_id) >= 3
       and count(distinct created_by_id) >= 3
)

select
    to_hex(md5(concat(
        s.complex_id, '|', s.text_prefix45, '|', cast(s.session_no as string)
    ))) as campaign_id,
    s.order_id,
    s.complex_id,
    s.complex_name,
    s.house_id,
    s.house_number,
    s.citizen_id,
    s.created_by_id,
    s.created_at,
    s.order_date,
    date_trunc(s.order_date, month) as report_month,
    s.text_prefix45,
    s.text_norm,
    s.category_ua,
    s.is_escalation,
    s.is_legal,
    s.is_collective,
    s.is_osbb_intent
from sessionized s
join qualified q
  on q.complex_id = s.complex_id
 and q.text_prefix45 = s.text_prefix45
 and q.session_no = s.session_no
