-- Guard: у подіях з'явився event_type, якого немає в seed product_event_catalog.
--
-- Без цього тесту нова подія мовчки провалюється в NULL-модуль і зникає з
-- усіх продуктових mart'ів — рівно те, що сталося з поточним дашбордом, де
-- 32 з 135 типів подій (24% обсягу) осідали в 'Інше' і викидались.
--
-- Якщо тест впав: додати новий event_type у seeds/product_event_catalog.csv,
-- проставити module_code і, якщо це ТЕРМІНАЛЬНА цільова дія, — is_core_event
-- та star_category.

select
    e.event_type,
    count(*) as n_events,
    min(e.event_date) as first_seen,
    max(e.event_date) as last_seen
from {{ ref('stg_amplitude__events') }} as e
left join {{ ref('product_event_catalog') }} as c
       on c.event_type = e.event_type
where c.event_type is null
group by e.event_type
