# operational — джерела Looker Studio (з прив'язкою до сторінок)

Извлечено 2026-07-08 з job history. Всього джерел: 18 (13 custom + 5 passthrough).

**Оновлення 2026-07-09:** прив'язка sql↔сторінка перевірена по PDF-експорту дашборду (`Операційний_дешборд.pdf`, 4 сторінки). Метод — той самий, що й для продуктового: точний збіг назв колонок кінцевого SELECT із підписами таблиць на дашборді (не по темі, а по буквальному значенню).

## Сторінки дашборду

1. **Огляд: Мешканці та об'єкти** — юзери (потенційні/підтверджені/активні) + розмір ЖК (будинки/квартири/комерція/паркінги) + заселеність
2. **Операційна ефективність (SLA)** — заявки створено/виконано/відхилено, % виконання (загалом і міс.в.міс.), розріз по року створення
3. **Аналітика звернень: Типи та Категорії** — розбивка по типу клієнта (проблема/скарга/…) і категорії (15 видів), відхилені заявки по будинку, особові рахунки
4. **Антирейтинг: Скарги та Навантаження** — навантаження на ЖК, "індекс проблемності" по будинку (132 записи) і по ЖК (10 записів)

## Підтверджена прив'язка

| Файл | Сторінка(и) | Що саме (точний збіг колонок) | Впевненість |
|---|---|---|---|
| `custom_active_users__5cd58443.sql` | **Стр.1** (юзери+розмір ЖК, помісячно і по ЖК) + **Стр.2** (заявки по ЖК: Всього/Виконано/%/В процесі) | `houses_count/apartments_count/commercials_count/parking_count/total_users_count/confirmed_users_count/active_users_count/pct_*` (Стр.1); `opened_requests/completed_requests/pct_completed_requests/backlog_requests` (Стр.2) | Confirmed (exact match) — одна широка таблиця живить обидві сторінки |
| `custom_core_events__5260ec7d.sql` | **Стр.2** (топ-scorecards + таблиця "Місяць в місяць") + **Стр.3** (Особові рахунки) | `tickets_total/tickets_completed/tickets_completed_same_month/tickets_canceled/sla_rate/cancel_rate/sla_rate_same_month/cancel_rate_same_month` (Стр.2); `personal_accounts` (Стр.3) | Confirmed (exact match) |
| `custom_orders_4__712d860f.sql` | **Стр.2** (таблиця "ЖК × Рік створення") | `complex_name/creation_year/total_created/total_completed/total_in_progress/total_canceled/completion_rate` | Confirmed (exact match) |
| `passthrough_vw_dm_apartment_occupancy_monthly__a30ec206.sql` | **Стр.1** (% заселення квартир / % заселення підтверджених) | `occupied_apartments/total_apartments` → %заселення; `occupied_by_confirmed_apartments/total_apartments` → %заселення підтверджених | Confirmed (exact match, passthrough) |
| `custom_retention__b85eb016.sql` | **Стр.3** (головна таблиця: типи звернень+навантаження+задачі) + **Стр.4** (ті самі навантаження-метрики, агреговано по компанії) | `problem_cnt/complaint_cnt/offer_cnt/question_cnt/service_cnt/problem_complaint/load_rate/complaint_rate/complaint_load/employee_task/total_tasks/task_ratio/total_orders/overdue_30_days` | Confirmed (exact match) |
| `custom_occupancy_2__d98354cb.sql` | **Стр.3** ("Відхилені заявки по ЖК, будинку та типу об'єкта") | `canceled_tickets_count` by complex/house/object_type/month | Confirmed (exact match) |
| `custom_occupancy__8677b241.sql` | **Стр.3** (таблиці категорій — 15 видів, і типів звернень — 5 видів) + **Стр.4** (обидва рейтинги "Індекс проблемності": по будинку 1-100/132 і по ЖК 1-10/10) | `issue_category` (Стр.3); `request_type` (Стр.3); `tickets_count/house_total_spaces` → індекс по будинку; `tickets_count/complex_total_spaces` → індекс по ЖК (Стр.4) | Confirmed (exact match) — одне джерело живить 4 різні таблиці на 2 сторінках |
| `custom_orders_5__b0ffa674.sql` | **Стр.4** (таблиця "Проблеми+Скарги/Скарги" по ЖК, з рядком "Середній показник") | `load_ps_pct/load_s_only_pct` + `average_row` union | Confirmed (exact match, включно з рядком середнього) |
| `passthrough_vw_dm_operations_monthly__071edbc8.sql` | **Стр.1?** (можливо дублює частину `5cd58443`) | `active_users/confirmed_users/count_apartments/count_commercials/count_houses/count_parkings/total_users` — майже ідентичний набір колонок до `5cd58443` | Candidate — 383 запуски (дуже активне), але яку саме частину Стр.1 живить окремо від `5cd58443` — невизначено без доступу до Looker UI |
| `custom_core_events_2__d7ed1d25.sql` | ? | `opened/completed/canceled_requests` на гранулярності complex×**space**×category×type — не бачив жодної видимої таблиці цієї гранулярності на 4 сторінках | Unconfirmed — можливо drill-down, прихований за кліком, не в PDF-експорті |
| `custom_orders__2c8667f1.sql` | ? | `category_name/request_type/quantity/share_in_complex_percent` по будинку — категорії через STRUCT-словник (див. AUDIT.md, розбіжність з `8677b241`) | Unconfirmed — можливо legacy-дублікат `8677b241`, не на дашборді |
| `custom_orders_2__e7906ec1.sql` | ? | `creation_year/total_created/completed/completion_rate/backlog/canceled` — БЕЗ розрізу по ЖК (на відміну від `712d860f`, який має complex_name) | Unconfirmed — можливо legacy, витіснений `712d860f` |
| `custom_orders_3__a4f3efef.sql` | ? | `status_group` (В процесі/Виконано/Скасовано) + `requests_count`, без розрізу ЖК/місяця, БЕЗ фільтра деактивованих будинків | Не знайдено на жодній з 4 сторінок — імовірно прибрано з дашборду (як `dm_company_churn_monthly` на продукті) |
| `custom_active_users_2__0e4066b4.sql` | — | (покинутий чорновик, `last_seen` 11.06) | Не на дашборді — підтверджено раніше в AUDIT.md |
| `custom_active_users_3__7de8e343.sql` | — | (покинутий чорновик, `last_seen` 12.06, 9 запусків) | Не на дашборді — підтверджено раніше в AUDIT.md |
| `passthrough_vw_dm_objects_filter__39ff4c22.sql` | — | (`last_seen` 13.06) | Не на дашборді — той самий view з багом #1 |
| `passthrough_vw_dm_complex_user_segments_monthly__ea295adc.sql` | — | (`last_seen` 11.06, 4 запуски) | Не на дашборді |
| `passthrough_view_monthly_active_residents__23cf377a.sql` | — | (`last_seen` 11.06, 14 запусків) | Не на дашборді |

## Відкриті питання (не гадаю — краще спитати)

1. **`5cd58443` vs `071edbc8`** — обидва мають майже ідентичний набір колонок для Стр.1. Чи це навмисне дублювання (одна для тренду, інша для якогось іншого елемента), чи `071edbc8` — залишок старої версії джерела даних? Не критично для розуміння логіки (обидві коректні й узгоджені між собою), але для dbt варто консолідувати в одну модель.
2. **`d7ed1d25`, `2c8667f1`, `e7906ec1`** — не знайдені на жодній з 4 сторінок PDF. Це drill-down таблиці (не потрапляють в PDF-друк), legacy-джерела, чи щось прибране? Якщо потрібна 100% певність — можеш скинути сам SQL з Looker (Resource → Manage added data sources) саме для цих трьох, або підтвердити з пам'яті.
3. **`a4f3efef`** (статуси заявок) — не знайдено на дашборді, схоже на прибраний елемент (як churn на продукті). Підтверджуєш?
