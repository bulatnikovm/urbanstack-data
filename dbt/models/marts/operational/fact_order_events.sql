-- Grain: подія (не заявка). Замінює повторюваний UNION ALL "Request_Actions",
-- знайдений в 5 старих Looker-запитах (Q3/Q4/Q5/Q10/Q11).
--
-- 'created' — синтетична подія з orders.created_at (одна на заявку).
-- Решта — реальні status-transition події з history (before→after), кожна
-- транзиція в конкретний статус = подія з цим статусом як event_type.
-- ⚠️ Заявка МОЖЕ мати кілька подій одного типу (напр. completed→consideration
-- →completed знову, 693 таких переходів у сирих даних) — тут це навмисно НЕ
-- згорнуто в "перше"/"останнє": mart-шар вирішує, яку семантику брати
-- (перше виконання / фінальний стан на кінець місяця), не fact.

with created_events as (
    select
        order_id,
        'created' as event_type,
        created_at as event_at
    from {{ ref('stg_dim9000__orders') }}
),

transition_events as (
    select
        order_id,
        status_after as event_type,
        transitioned_at as event_at
    from {{ ref('stg_dim9000__order_status_transitions') }}
    where status_after is not null
)

select order_id, event_type, event_at from created_events
union all
select order_id, event_type, event_at from transition_events
