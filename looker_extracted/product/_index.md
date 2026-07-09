# product — источники Looker Studio

Извлечено 2026-07-08 из job history. Всего источників: 27.

**Оновлення 2026-07-08:** прив'язка sql↔сторінка підтверджена вручну — зіставлено PDF-експорт дашборду (`Продуктовий_дешборд.pdf`, 5 сторінок = Стр.1-5) з конкретними значеннями/категоріями всередині SQL (типи подій, назви модулів, вікна днів, назви категорій). Метод і застереження — у розділі нижче.

| Файл | Тип | runs | last_seen | Сторінка | Впевненість |
|---|---|---|---|---|---|
| `passthrough_view_monthly_active_residents__29749f51.sql` | passthrough | 290 | 2026-07-08 | Стр.1 | Confirmed (passthrough) |
| `passthrough_vw_dm_operations_monthly__c9b60582.sql` | passthrough | 505 | 2026-07-08 | Стр.1 | Confirmed (passthrough) |
| `custom_version_os__9661205a.sql` | custom | 288 | 2026-07-08 | Стр.1 (OS/версії) | Confirmed (exact match) |
| `custom_retention__aa9975c4.sql` | custom | 288 | 2026-06-01 | Стр.1 (% підтверджених, MAU%) | Confirmed |
| `custom_active_users__4738bf74.sql` | custom | 20 | 2026-06-01 | Стр.1? (альт. "Відвідувачі") | Candidate — можливо legacy/дубль |
| `custom_citizen_stat__45b8b948.sql` | custom | 25 | 2026-06-01 | Стр.1? (альт. potential/confirmed) | Candidate — можливо legacy/дубль |
| `custom_retention_2__17fe7429.sql` | custom | 250 | 2026-07-08 | **Стр.2** (New/Activated/Passively Activated + Відсоток активованих + Конверсія) | Confirmed (exact match) |
| `custom_new_users__d303fc10.sql` | custom | 26 | 2026-07-08 | **Стр.2** (Медіанна к-сть годин до цінної дії) | Confirmed (exact match: 39,5) |
| `custom_events_usage_4__ea2219dc.sql` | custom | 38 | 2026-07-08 | Стр.2? (funnel перегляд→оплата квитанції) | Unconfirmed — не видно явно на PDF |
| `custom_events_usage_3__f05a1e35.sql` | custom | 39 | 2026-07-08 | Стр.2? (бакети суми платежу) | Unconfirmed — не видно явно на PDF |
| `custom_core_events_5__ad928bbd.sql` | custom | 120 | 2026-07-08 | **Стр.3** (Середній денний актив) | Confirmed |
| `custom_events_usage__3528e8f5.sql` | custom | 138 | 2026-07-08 | **Стр.3** (Медіанний час сесії, хв) | Confirmed |
| `custom_events_usage_2__9f518bc4.sql` | custom | 46 | 2026-07-08 | **Стр.3** (Медіанний час користувача за місяць, хв) | Confirmed |
| `custom_core_events_3__8835a9b6.sql` | custom | 147 | 2026-07-08 | **Стр.3** (Співвідношення по оплатам: Успішні/Відхилені) | Confirmed |
| `custom_core_events_4__95376d7d.sql` | custom | 145 | 2026-07-08 | **Стр.3** (Сума оплачених квитанцій, бар) | Confirmed |
| `custom_core_events_7__77f4f0f7.sql` | custom | 46 | 2026-07-08 | **Стр.3** (Побачили голосування/Проголосували/Конверсія) | Confirmed |
| `custom_core_events_6__36437f5e.sql` | custom | 47 | 2026-07-08 | **Стр.3** (К-сть створених заявок/платних заявок) | Confirmed |
| `custom_phone_auth_2__bc3b2d0d.sql` | custom | 59 | 2026-07-08 | **Стр.3** (Використання модулів у додатку, таблиця) — PROD-010 | Confirmed (exact match) |
| `custom_retention_5__00b07e7a.sql` | custom | 93 | 2026-07-08 | **Стр.3** (Активні/Сплячі/Ризик відтоку/Загублені/Мертві душі + Стара/Актуальна версія) | Confirmed (exact match) |
| `custom_retention_4__f5c03f68.sql` | custom | 105 | 2026-07-08 | **Стр.3** (% відвалу модуля / Днів між сесіями / Днів до відвалу) — PROD-010 | Confirmed (exact match) |
| `custom_core_events__e242ceed.sql` | custom | 206 | 2026-07-06 | **Стр.4** (категорії + STAR = `nsm_penetration_rate`) — PROD-009 | Confirmed (exact match, актуальна версія) |
| `custom_core_events_2__da7f1d65.sql` | custom | 162 | 2026-06-12 | Стр.4 — **дублікат** попереднього, старіша версія запиту (SUPERSEDED) | Confirmed (superseded) |
| `passthrough_vw_dm_nsm_categories_monthly__e9e10a96.sql` | passthrough | 24 | 2026-07-08 | Стр.4? (паралельне/старе джерело тієї ж категоризації) | Candidate |
| `custom_phone_auth__29eaf862.sql` | custom | 147 | 2026-07-08 | **Стр.5** (Відсоток логаутів, по ОС/версії) | Confirmed (exact match) |
| `custom_retention_3__b3c2e647.sql` | custom | 117 | 2026-07-08 | **Стр.5** (% відвалу біометрії / Всього з біометрією) | Confirmed |
| `custom_phone_auth_3__63b36903.sql` | custom | 38 | 2026-07-08 | Стр.5 (біометрія, компаньйон-метрика) | Candidate |
| `passthrough_dm_company_churn_monthly__72a3cb14.sql` | passthrough | 41 | 2026-06-11 | ⚠️ **не побачено на жодній з 5 сторінок PDF** | Суперечність — див. нижче |

## Метод підтвердження

PDF-експорт дашборду (`Продуктовий_дешборд.pdf`, 5 сторінок = Стр.1-5 з CLAUDE.md) сконвертовано в текст (`pdfplumber`). Для кожного SQL-файлу шукались точні збіги з текстом сторінки: назви категорій (`'1. Заявки'`, `'2. СКД (Доступ)'`, `'6. Голосування'`...), назви полів (`nsm_penetration_rate`, `median_time_min`, `true_module_drop_off_rate`...), вікна днів (`[30 днів]`/`[90 днів]`/`[180 днів]`), сегменти (`Активні (< 1 міс)`, `Мертві душі (> 1 року)`). Збіг рядок-в-рядок = `Confirmed`; збіг лише по темі/таблиці без точного значення = `Candidate`.

## Знахідки

- **PROD-008/009/010 закриті на рівні точної прив'язки**, а не лише "десь у папці": Стр.2 = `custom_retention_2__17fe7429.sql` + `custom_new_users__d303fc10.sql`; Стр.4/STAR = `custom_core_events__e242ceed.sql`; Стр.3/модулі = `custom_phone_auth_2__bc3b2d0d.sql` + `custom_retention_4__f5c03f68.sql`.
- **`custom_core_events_2__da7f1d65.sql` — застарілий дублікат** `custom_core_events__e242ceed.sql` (та сама логіка STAR, дрібна відмінність у JOIN, `last_seen` на місяць старіше). Ігнорувати при dbt-міграції, канонічна версія — `e242ceed`.
- ⚠️ **Суперечність з реєстром метрик.** PROD-013 (Churn компанії) у реєстрі позначено «не бачив на дашборді», але `dm_company_churn_monthly` **фактично є активним джерелом даних продуктового репорту** (`c2180c98`, 41 запуск за 90 днів, останній — 2026-06-11). Або (а) графік був на дашборді й прибраний нещодавно, або (б) джерело підключене, але схований/невидимий елемент. Уточнити з Артемом.
- 4 джерела лишаються **непідтвердженими** (`ea2219dc`, `f05a1e35`, `4738bf74`, `45b8b948`, `63b36903`) — не знайдено точного відповідника серед видимого тексту 5 сторінок PDF. Можливо: (а) legacy-джерела, залишені підключеними після зміни дизайну графіка, (б) фільтри/приховані елементи, не видні в PDF-експорті, (в) частина функціоналу, вирізана з поточної версії дашборду.
