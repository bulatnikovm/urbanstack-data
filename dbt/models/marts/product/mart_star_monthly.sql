-- Стр.4 — North Star Metric.
-- Грануляція: report_month × star_category (+ рядок '0. Всього активних').
--
-- STAR = унікальні користувачі, що виконали ТЕРМІНАЛЬНУ цільову дію, поділені
-- на потенційну базу (верифіковані, недеактивовані користувачі з приміщенням,
-- накопичувально на кінець місяця).
--
-- ⚠️ Зміна методики (рішення Микити 2026-08-04): категорія "3. Голосування"
-- рахується по `vote_details_active_btn_vote_tap` (натиснув "Проголосувати"),
-- а не по `vote_details_active_form__tap` (возня у формі, 88,6 події на юзера
-- і МЕНШЕ унікальних юзерів). Принцип: core event — це останній, завершальний
-- івент ланцюжка. Наслідок: категорія зростає ~640 → ~945 (лип.2026), STAR
-- відповідно теж. Стр.3 (воронка голосувань) і Стр.4 тепер узгоджені —
-- раніше показували 946 і 688 за той самий місяць.
--
-- ⚠️ Прибрано `widget_control_center_key_btn__click` і `widget_lock_key_btn__click`
-- зі списку СКД: обидві події мають 0 записів за всю історію, тобто не існують.

-- ЗНАМЕННИК STAR — рішення Микити 2026-08-04: ділимо на ЗАГАЛЬНУ БАЗУ
-- (усі можливі користувачі), а не на підтверджених. Канонічне поле —
-- `star_rate` (= unique_users / count_potential).
--
-- ⚠️ База при цьому ОЧИЩЕНА (на відміну від дашборду, де "Потенційних 33 213"
-- включає і деактивованих, і мешканців деактивованих будинків): це активні
-- мешканці — не співробітники УК, без ROLE_INACTIVATED_CITIZEN, у
-- недеактивованих будинках (point-in-time).
--
-- Контекст: на дашборді співіснували ДВА знаменники — власне поле
-- nsm_penetration_rate у `custom_core_events__e242ceed.sql` ділило на
-- ПІДТВЕРДЖЕНИХ (лип.2026: 15 854 → ≈21%), а показник "STAR 10,03%" на Стр.4
-- Looker рахував проти "Потенційних" (33 204) з іншого джерела. Тобто поле з
-- самого STAR-запиту не використовувалось. Тепер канонічний варіант один,
-- `star_rate_of_confirmed` лишено довідково.
with potential as (

    select
        report_month,
        count(distinct if(is_active_resident, user_id, null))                    as count_potential,
        count(distinct if(is_active_resident and is_confirmed, user_id, null))   as count_confirmed
    from {{ ref('int_user_base_monthly') }}
    group by report_month

),

core_events as (

    select
        event_month,
        star_category,
        user_phone_sk
    from {{ ref('int_events_enriched') }}
    where is_core_event
      and user_phone_sk is not null

),

by_category as (

    select
        event_month,
        star_category,
        count(distinct user_phone_sk) as unique_users
    from core_events
    group by event_month, star_category

    union all

    select
        event_month,
        '0. Всього активних' as star_category,
        count(distinct user_phone_sk) as unique_users
    from core_events
    group by event_month

)

select
    b.event_month                                       as report_month,
    format_date('%Y-%m', b.event_month)                 as report_month_key,
    b.star_category,
    b.unique_users,

    coalesce(p.count_potential, 0)                      as count_potential,
    coalesce(p.count_confirmed, 0)                      as count_confirmed,

    -- КАНОНІЧНЕ: активні / загальна (очищена) база.
    safe_divide(b.unique_users, p.count_potential)      as star_rate,
    -- Довідково: проти підтверджених (як рахувало невикористане поле в SQL).
    safe_divide(b.unique_users, p.count_confirmed)      as star_rate_of_confirmed,

    safe_divide(
        b.unique_users - lag(b.unique_users) over (
            partition by b.star_category order by b.event_month),
        lag(b.unique_users) over (
            partition by b.star_category order by b.event_month)
    )                                                   as mom_change_pct

from by_category as b
left join potential as p on p.report_month = b.event_month
