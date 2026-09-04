-- Стр.5 — Здоров'я продукту. Грануляція: event_week × os_type × app_version.
--
-- Дві незалежні теми в одній моделі (обидві тижневі, обидві з фільтрами
-- ОС/версія на дашборді):
--   1. Примусові логаути: юзер побачив екран авторизації, але сам не виходив
--      (не тиснув logout/reauth/forgot) і це не нова реєстрація.
--   2. Біометрія — канонічна методика з custom_phone_auth_3__63b36903
--      (3 метрики, включно з Fallback to PIN). Застаріла версія
--      custom_retention_3__b3c2e647 (2 метрики) свідомо не портується.
--        total_bio_users          — лояльні "біометричні" юзери, що бачили PIN-екран
--        technical_friction_users — поп-ап біометрії НЕ з'явився і скіпу не було
--        biometric_fallback_users — поп-ап був, скіпу не було, але юзер ввів PIN

with events as (

    select
        event_date,
        event_week,
        event_time,
        event_type,
        session_id,
        user_phone_sk,
        os_type,
        app_version
    from {{ ref('stg_amplitude__events') }}
    where user_phone_sk is not null

      -- Нижня межа — та сама й з тієї ж підстави, що в `srv_metric_timeseries`:
      -- до 2024 в Amplitude технічний шум. Без неї у витрину потрапляли тижні
      -- 1969-12-29, 2009-12-28 і 2021-08-23 — усі з НУЛЕМ активних, тобто на
      -- графіку невидимі, але вісь розтягували на пів століття. Разом із ними
      -- відпадає 2023 рік: 8 тижнів на 12 активних людино-тижнів сумарно.
      and event_week >= '2024-01-01'

),

-- ── 1. Логаути ────────────────────────────────────────────────────────────
weekly_user as (

    select
        event_week,
        os_type,
        app_version,
        user_phone_sk,
        max(event_type = 'news_scrn__view')                             as is_active_user,
        max(event_type = 'auth_number_scrn__view')                      as saw_auth_screen,
        max(event_type in ('profile_profile_logout_confirm_tap',
                           'auth_pin_btn_reauth_tap',
                           'auth_pin_btn_forgot_tap'))                  as did_voluntary_action,
        max(event_type = 'auth_pin_create_scrn__view')                  as is_new_registration
    from events
    group by event_week, os_type, app_version, user_phone_sk

),

logout as (

    select
        event_week,
        os_type,
        app_version,
        count(distinct if(is_active_user, user_phone_sk, null))         as weekly_active_users,
        count(distinct if(saw_auth_screen
                          and not did_voluntary_action
                          and not is_new_registration, user_phone_sk, null))
                                                                        as forced_logout_users
    from weekly_user
    group by event_week, os_type, app_version

),

-- ── 2. Біометрія ──────────────────────────────────────────────────────────
bio_events as (

    select *
    from events
    where event_type in ('auth_pin_scrn__view',
                         'auth_pin_popup_face_touch_id_view',
                         'auth_pin_create_btn_face_biomid_id_skip_tap',
                         'auth_pin_text_field__type')

),

loyalty as (

    -- "Лояльний біо-юзер" = за попередні 30 днів хоч раз бачив поп-ап біометрії.
    select
        *,
        max(if(event_type = 'auth_pin_popup_face_touch_id_view', 1, 0)) over (
            partition by user_phone_sk
            order by unix_date(event_date)
            range between 30 preceding and 1 preceding
        ) as is_loyal_bio_user
    from bio_events

),

by_session as (

    select
        event_week,
        os_type,
        app_version,
        user_phone_sk,
        session_id,
        max(is_loyal_bio_user) = 1                                              as is_loyal_bio_user,
        max(event_type = 'auth_pin_scrn__view')                                 as has_pin_screen,
        max(event_type = 'auth_pin_popup_face_touch_id_view')                   as has_bio_popup,
        max(event_type = 'auth_pin_create_btn_face_biomid_id_skip_tap')         as has_skip,
        max(event_type = 'auth_pin_text_field__type')                           as has_pin_typing
    from loyalty
    group by event_week, os_type, app_version, user_phone_sk, session_id

),

bio as (

    select
        event_week,
        os_type,
        app_version,
        count(distinct if(is_loyal_bio_user and has_pin_screen, user_phone_sk, null))
                                                                        as total_bio_users,
        count(distinct if(is_loyal_bio_user and has_pin_screen
                          and not has_bio_popup and not has_skip, user_phone_sk, null))
                                                                        as technical_friction_users,
        count(distinct if(is_loyal_bio_user and has_bio_popup
                          and not has_skip and has_pin_typing, user_phone_sk, null))
                                                                        as biometric_fallback_users
    from by_session
    group by event_week, os_type, app_version

)

select
    coalesce(l.event_week, b.event_week)                                as event_week,
    coalesce(l.os_type, b.os_type)                                      as os_type,
    coalesce(l.app_version, b.app_version)                              as app_version,

    coalesce(l.weekly_active_users, 0)                                  as weekly_active_users,
    coalesce(l.forced_logout_users, 0)                                  as forced_logout_users,
    safe_divide(l.forced_logout_users, l.weekly_active_users)           as forced_logout_rate,

    coalesce(b.total_bio_users, 0)                                      as total_bio_users,
    coalesce(b.technical_friction_users, 0)                             as technical_friction_users,
    coalesce(b.biometric_fallback_users, 0)                             as biometric_fallback_users,
    safe_divide(b.technical_friction_users, b.total_bio_users)          as technical_friction_rate,
    safe_divide(b.biometric_fallback_users, b.total_bio_users)          as biometric_fallback_rate

from logout as l
full join bio as b
       on b.event_week  = l.event_week
      and b.os_type     = l.os_type
      and b.app_version = l.app_version
