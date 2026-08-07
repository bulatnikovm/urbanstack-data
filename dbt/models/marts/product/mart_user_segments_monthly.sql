-- Стр.1 (stacked "Живі / Сонні / Мертві"). Грануляція: report_month × complex_id.
-- Порт vw_dm_complex_user_segments_monthly, але поверх канонічної бази
-- (int_user_base_monthly) і канонічного списку core-подій із seed'а.
--
-- Живі  — підтверджений юзер, що мав core-подію в цьому місяці
-- Сонні  — не мав у цьому, але мав у попередньому
-- Мертві — мовчить ≥2 місяці

with base as (

    select
        report_month,
        complex_id,
        user_id,
        user_phone_sk,
        is_confirmed
    from {{ ref('int_user_base_monthly') }}
    where is_active_resident and is_confirmed

),

core_activity as (

    select distinct
        event_month,
        user_phone_sk
    from {{ ref('int_events_enriched') }}
    where is_core_event
      and user_phone_sk is not null

),

flagged as (

    select
        b.report_month,
        b.complex_id,
        b.user_id,
        coalesce(cur.user_phone_sk is not null, false)   as active_this_month,
        coalesce(prv.user_phone_sk is not null, false)   as active_prev_month
    from base as b
    left join core_activity as cur
           on cur.user_phone_sk = b.user_phone_sk
          and cur.event_month   = b.report_month
    left join core_activity as prv
           on prv.user_phone_sk = b.user_phone_sk
          and prv.event_month   = date_sub(b.report_month, interval 1 month)

),

complexes as (

    select complex_id, complex_name from {{ ref('dim_complex') }}

)

select
    f.report_month,
    format_date('%Y-%m', f.report_month)                                as report_month_key,
    f.complex_id,
    c.complex_name,

    count(distinct f.user_id)                                           as confirmed_users,
    count(distinct if(f.active_this_month, f.user_id, null))            as segment_alive,
    count(distinct if(not f.active_this_month and f.active_prev_month, f.user_id, null))
                                                                        as segment_sleeping,
    count(distinct if(not f.active_this_month and not f.active_prev_month, f.user_id, null))
                                                                        as segment_dead

from flagged as f
left join complexes as c on c.complex_id = f.complex_id
group by f.report_month, f.complex_id, c.complex_name
