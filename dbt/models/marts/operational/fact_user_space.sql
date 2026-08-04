-- Grain: user_id × space_id. Тільки мешканці (ROLE_CITIZEN/ROLE_INACTIVATED_CITIZEN),
-- не співробітники — заміна "Q1 user_chain" зі старих Looker-запитів.

with users as (
    select * from {{ ref('stg_dim9000__users') }}
    where role in ('ROLE_CITIZEN', 'ROLE_INACTIVATED_CITIZEN')
),

space_user as (
    select * from {{ ref('stg_dim9000__space_user') }}
),

geo as (
    select * from {{ ref('int_space_geo') }}
)

select
    u.user_id,
    su.space_id,
    g.house_id,
    g.complex_id,
    g.complex_name,
    u.role,
    u.role = 'ROLE_CITIZEN' as is_active_role,
    u.verified,
    u.created_at as user_created_at
from users u
inner join space_user su on su.user_id = u.user_id
left join geo g on g.space_id = su.space_id
