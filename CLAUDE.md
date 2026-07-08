# CLAUDE.md — UrbanStack Data Infrastructure

> Знімок стану на 2026-07-08. Живий документ — онови секції 4, 5, 8, 9 по мірі просування по фазах.

## 1. Хто я і що роблю

Микита — єдина людина в аналітиці/даних в UrbanStack (раніше DIM9000), proptech, ~30 000 мешканців, 150+ будинків, Україна. Самостійно побудував весь стек: BigQuery + Python ETL + Looker Studio. Зараз переводжу інфраструктуру на dbt і будую новий продуктовий дашборд на React (Bklit UI + shadcn/ui).

Є три дашборди: **продуктовий** (буде тільки внутрішній, не white-label), **операційний** та **фінансовий** (обидва підуть у white-label для майбутніх клієнтів UrbanStack).

## 2. Ціль поточної роботи — два треки

- **Тренувальний трек (зараз тут):** навести лад у поточній (single-tenant) BigQuery-базі UrbanStack — dbt-моделі, чистий реєстр метрик, новий продуктовий дашборд. Це не пісочниця — реальні продакшн-дані, реальні баги, реальна користь для UrbanStack просто зараз.
- **Цільовий трек (пізніше):** перенести здобуті уроки в дизайн мультитенантної бази для UrbanStack SaaS (1+ ЖК/УК, white-label клієнти).

## 3. BigQuery — інфраструктура

Project: `analytics-454817`

| Датасет | Статус | Що це |
|---|---|---|
| `postgresqldim9000` | **активний** | Stitch-sync продуктової Postgres БД: CRM (users/spaces/sections/houses/complexes), білінг (master_buh_*), копія Amplitude events (`EVENTS_407641`), + вже існуючі "недо-марти" (`dm_*`, `vw_dm_*`, `view_*`) |
| `finance_dash` | активний | Фінансовий шар. Вже має конвенцію `dim_*` / `fact_*` / `mart_*` — хороший приклад для dbt-міграції, переносити майже 1:1 |
| `dim9000_fast` | активний | Джерело для алертної системи. Ще не аудували — schema/lineage невідомі |
| `dim9000_analytics` | активний | Джерело для masterbuh-дашборду. Ще не аудували — schema/lineage невідомі |
| `amlitude_EU` | **не використовується** | Оригінальний Amplitude BigQuery export (`EVENTS_407641` + `users_objects_complexes`). Дублюючий і мертвий, як `postgresql` нижче — лишається в BigQuery, свідомо ігноруємо |
| `postgresql` | **МЕРТВИЙ** | Останній sync 2025-04-29 (підтверджено запитом). Не використовувати. Лишається в BigQuery, свідомо ігноруємо |

Регіон датасету (`region-eu`/`region-us`) — не підтверджено, перевірити перед INFORMATION_SCHEMA-запитами.

## 4. Знайдені проблеми (Фаза 0 audit)

1. **`deactivated_houses` drift.** Хардкод-список задубльований у 4+ views з розбіжністю: 10 записів у `view_monthly_active_residents`/`vw_dm_complex_user_segments_monthly`, 11 у `vw_dm_apartment_occupancy_monthly`/`vw_dm_operations_monthly`, і лише **3 з 11** у `vw_dm_objects_filter` — з коментарем у самому коді `-- и остальные...` (незавершений копіпаст). Наслідок: підрахунки в `vw_dm_objects_filter` не виключають 8 деактивованих будинків, які виключають інші view. **Фікс:** винести список в окремий reference view `ref_deactivated_houses`, всі 5 view джойняться на нього замість дублювання UNNEST — див. пункт у розділі 8.
2. **Дві паралельні методики боргу.** `mart_debt_flat`/`mart_debt_aging` рахують борг як `initial_debt`; `mart_debt_alena` — як `debt_balance − paid_amount`. Обидві живуть одночасно, не узгоджено яка канонічна для дашборду. **Відкладено до аудиту фінансового дашборду** (не блокує Фазу 1) — фінансові view вже побудовані акуратно, але додатковий аудит перед dbt-міграцією не завадить.
3. **`mart_payment_rates` vs `mart_payments_rate`.** Два різні view з майже ідентичними назвами (відрізняються однією літерою) — `mart_payment_rates` (grain: приміщення × послуга) зараз **актуальний**, `mart_payments_rate` (grain: агрегат по ЖК × місяць) — **legacy**, більше не використовується. Через схожість назв легко звернутись не до того при пошуку. ⚠️ Реєстр метрик v0.1 (FIN-005, "Природний рівень оплат") зараз посилається на legacy `mart_payments_rate` — виправити на `mart_payment_rates` при переході на v1.0.
4. **Прихована логіка в Looker Studio.** Стр.2 (Активація), Стр.3 (Активність/модулі), Стр.4 (North Star/STAR), Стр.5 (Здоров'я продукту) — логіка НЕ існує як BigQuery view, живе як custom SQL всередині джерел даних Looker Studio. `INFORMATION_SCHEMA` її не бачить. **Це головна невідома зона — Фаза 1 закриває саме її.**
5. ✅ **Закрито:** `iban` у джерелі `dim_llc` (`tascombank_merchants WHERE purpose='payment'`) унікальний — перевірено запитом, fan-out ризику при джойнах немає.
6. ✅ **Закрито:** `postgresql` емпірично підтверджений мертвим (останній sync 2025-04-29 проти сьогоднішнього sync `postgresqldim9000`).
7. ✅ **Закрито.** Рішення по `amlitude_EU`, `postgresql` і view `users_objects_complexes`: не мігрувати, не видаляти — лишаються в BigQuery як є, свідомо ігноруємо. Якщо десь у Looker щось досі на них посилається — не чіпати, поки не зʼявиться конкретна причина.

## 5. Реєстр метрик

Файл `UrbanStack_metrics_registry.xlsx` (перенести в репозиторій, напр. `docs/metrics_registry.xlsx`, або конвертувати в git-friendly markdown/YAML — рекомендовано для diff-friendly роботи і подальшої генерації dbt `schema.yml`).

Поточний стан v0.1: 13 метрик Product, 7 Financial, 0 Operational (ще не аудували).

Колонки: `ID` · `Домен` · `Метрика` · `Визначення` · `Формула/логіка` · `Grain` · `Джерело (dataset.view)` · `Сторінка дашборду` · `dbt target (план)` · `Власник методології` · `Статус` · `Нотатки/відомі проблеми`.

Статуси: `Active` / `Потребує аудиту` (логіка не знайдена в BQ) / `Потребує узгодження` (є конфліктні версії) / `Known issue` / `Заплановано` / `Готово, не візуалізовано`.

## 6. Продуктовий дашборд — відома lineage

| View | Grain | Ймовірна сторінка |
|---|---|---|
| `view_monthly_active_residents` | complex × month | Стр.1 (Потенційних/Підтверджені/Не власники) |
| `vw_dm_complex_user_segments_monthly` | complex × month | Сегменти Живі/Сонні/Неактивні — готово, не на дашборді |
| `vw_dm_operations_monthly` | complex × month | Стр.1/4, найбільший view |
| `vw_dm_apartment_occupancy_monthly` | house × month | заселеність, не бачив на дашборді |
| `vw_dm_objects_filter` | complex × object_type × month | розбивка по типу об'єкта — **містить баг #1** |
| `dm_company_churn_monthly` | month (вся компанія) | churn, не бачив на дашборді |
| Стр.2, 3, 4, 5 | ? | **невідомо — Looker custom SQL, дивись Фазу 1** |

## 7. Roadmap

| Фаза | Що | Статус |
|---|---|---|
| 0 | Аудит схеми, lineage, знайдені баги, реєстр v0.1 | ✅ закрито |
| 1 | Витягнути Looker custom SQL (Стр.2-5), аудит операційного дашборду, реєстр → v1.0 | 🔲 **зараз тут** |
| 2 | dbt на поточних даних: seeds → staging → intermediate → marts | 🔲 |
| 3 | Новий продуктовий дашборд: Bklit UI + shadcn/ui поверх чистих marts | 🔲 |
| 4 | Перенос уроків у мультитенантний дизайн для UrbanStack SaaS | 🔲 |

## 8. Наступні кроки (Фаза 1)

- [ ] Витягнути custom SQL для Стр.2/3/4/5 з Looker Studio: `Resource → Manage added data sources → [джерело] → Edit Connection`
- [ ] Створити `ref_deactivated_houses` view (canonical список, 11 записів — звір повноту перед створенням) і переключити всі 5 view на нього замість дубльованого UNNEST
- [ ] Такий самий `INFORMATION_SCHEMA` дамп (TABLES/COLUMNS/VIEWS) для джерел операційного дашборду
- [ ] Аудит `dim9000_fast` (алертна система) і `dim9000_analytics` (masterbuh-дашборд) — schema/lineage поки невідомі
- [ ] Виправити джерело FIN-005 у реєстрі метрик: `mart_payment_rates` (не legacy `mart_payments_rate`)
- [ ] Дозаповнити реєстр метрик до v1.0 (Product повністю + Operational)

## 9. Вже прийняті рішення

- Хардкод-списки (`excluded_complexes`, `deactivated_houses`, список "core events") → **dbt seeds**, не copy-paste між моделями — структурно унеможливлює баг #1. Проміжний крок до dbt: `ref_deactivated_houses` як звичайний BigQuery view вже зараз.
- Спільний intermediate `int_space_geo` для ланцюжка `spaces → sections → houses → complexes`, який зараз повторюється практично в кожному запиті (і в finance_dash, і в продуктових views).
- `finance_dash` переноситься в dbt майже 1:1 (найменший ризик, хороший перший PR — вже має правильну dim/fact/mart конвенцію).
- Продуктова сторона (`vw_dm_*` монолiти) потребує повного рефакторингу в `fact_user_lifecycle` / `fact_activation_events` / `fact_module_usage`.
- Фаза 3: **Bklit UI + shadcn/ui разом**, не тільки Bklit — взяти найкраще з обох.

## 10. Люди

- **Артем** — CEO/засновник, methodology owner для продуктових KPI (STAR, core events), приймає рішення по неоднозначних метриках.
- **Максим** — PM.
- **Аліона** — фінансові дані; її методика розрахунку боргу (`mart_debt_alena`) потребує узгодження зі старою (`mart_debt_flat`).
- **Микита** (я) — sole data/analytics lead, автор усього стеку.

## 11. Корисні запити (regenerate schema snapshot)

```sql
-- Усі таблиці й view в проєкті (заміни region-eu на свій регіон)
SELECT table_catalog AS project, table_schema AS dataset, table_name, table_type
FROM `region-eu`.INFORMATION_SCHEMA.TABLES
WHERE table_catalog = 'analytics-454817'
ORDER BY dataset, table_name;
```

```sql
-- Всі колонки
SELECT table_schema AS dataset, table_name, column_name, data_type, ordinal_position
FROM `region-eu`.INFORMATION_SCHEMA.COLUMNS
WHERE table_catalog = 'analytics-454817'
ORDER BY dataset, table_name, ordinal_position;
```

```sql
-- SQL-визначення всіх view (lineage)
SELECT table_schema AS dataset, table_name, view_definition
FROM `region-eu`.INFORMATION_SCHEMA.VIEWS
WHERE table_catalog = 'analytics-454817'
ORDER BY dataset, table_name;
```

```sql
-- Перевірка "живості" датасету/таблиці
SELECT 'dataset_a' AS dataset, MAX(_sdc_received_at) AS last_synced
FROM `analytics-454817.dataset_a.table`
UNION ALL
SELECT 'dataset_b', MAX(_sdc_received_at)
FROM `analytics-454817.dataset_b.table`;
```
