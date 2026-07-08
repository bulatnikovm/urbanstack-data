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
| `dim9000_fast` | активний (**US**) | Окремий внутрішній продукт (алертна система), **не джерело жодного дашборду** (0 Looker-задань). Аудит не робимо. План: перенести в EU. |
| `dim9000_analytics` | активний (**US**) | Окремий внутрішній продукт (masterbuh), **не джерело дашбордів** (0 Looker-задань). Аудит не робимо. План: перенести в EU. |
| `bigquery` | **осиротілий (US)** | Не було в снімку v0.1 (Микита його «жодного разу не відкривав»). Містить `EVENTS_407641` (ще одна US-копія Amplitude) + 9 ad-hoc event-view (Retention D7/14/28, Phone Auth, New Users…). **Жоден дашборд його не читає** (0 Looker-задань). Схема — `schema/us_bigquery_*`. |
| `amlitude_EU` | **не використовується** | Оригінальний Amplitude BigQuery export (`EVENTS_407641` + `users_objects_complexes`). Дублюючий і мертвий, як `postgresql` нижче — лишається в BigQuery, свідомо ігноруємо |
| `postgresql` | **МЕРТВИЙ** | Останній sync 2025-04-29 (підтверджено запитом). Не використовувати. Лишається в BigQuery, свідомо ігноруємо |

**Регіон датасетів (підтверджено 2026-07-08):** EU — `postgresqldim9000`, `finance_dash`, `amlitude_EU`; US — `dim9000_fast`, `dim9000_analytics`, `bigquery`. ⚠️ BigQuery **не джойнить між регіонами** — дашборди й Looker живуть у EU; US-датасети ізольовані. Для INFORMATION_SCHEMA використовуй `region-eu` (дашбордний шар) або `region-us` (внутрішні продукти) відповідно. `EVENTS_407641` існує у **трьох** копіях: `amlitude_EU`, `postgresqldim9000` (жива, її читає продуктовий дашборд), `bigquery` (US, осиротіла).

## 4. Знайдені проблеми (Фаза 0 audit)

1. **`deactivated_houses` drift.** Хардкод-список задубльований у 4+ views з розбіжністю: 10 записів у `view_monthly_active_residents`/`vw_dm_complex_user_segments_monthly`, 11 у `vw_dm_apartment_occupancy_monthly`/`vw_dm_operations_monthly`, і лише **3 з 11** у `vw_dm_objects_filter` — з коментарем у самому коді `-- и остальные...` (незавершений копіпаст). Наслідок: підрахунки в `vw_dm_objects_filter` не виключають 8 деактивованих будинків, які виключають інші view. **Фікс:** винести список в окремий reference view `ref_deactivated_houses`, всі 5 view джойняться на нього замість дублювання UNNEST — див. пункт у розділі 8.
2. **Дві паралельні методики боргу.** `mart_debt_flat`/`mart_debt_aging` рахують борг як `initial_debt`; `mart_debt_alena` — як `debt_balance − paid_amount`. Обидві живуть одночасно, не узгоджено яка канонічна для дашборду. **Відкладено до аудиту фінансового дашборду** (не блокує Фазу 1) — фінансові view вже побудовані акуратно, але додатковий аудит перед dbt-міграцією не завадить.
3. ✅ **Закрито (реєстр v0.2).** `mart_payment_rates` vs `mart_payments_rate` — `mart_payment_rates` (grain: приміщення × послуга) **актуальний**, `mart_payments_rate` (grain: ЖК × місяць) — **legacy**. FIN-005 у реєстрі виправлено на `mart_payment_rates`. Ризик плутанини через схожі назви лишається — тримати в голові при пошуку.
4. ✅ **Закрито на рівні вилучення (Фаза 1).** Прихована логіка Looker (Стр.2-5) відновлена з BigQuery job history — див. `looker_extracted/`. **Усі** джерела даних Looker виявились custom SQL (не таблиці): продуктовий дашборд (`report_id c2180c98`) = 27 джерел, 23 custom на `EVENTS_407641` (активація/ретеншен/core-events/phone-auth). Логіка більше не «невідома». **Лишилось:** підтвердити з Артемом прив'язку конкретний datasource_id ↔ метрика/сторінка (layout Looker у BQ не зберігається) і винести в `fact_*`. Спосіб вилучення й застереження — у `looker_extracted/_index.md`.
5. ✅ **Закрито:** `iban` у джерелі `dim_llc` (`tascombank_merchants WHERE purpose='payment'`) унікальний — перевірено запитом, fan-out ризику при джойнах немає.
6. ✅ **Закрито:** `postgresql` емпірично підтверджений мертвим (останній sync 2025-04-29 проти сьогоднішнього sync `postgresqldim9000`).
7. ✅ **Закрито.** Рішення по `amlitude_EU`, `postgresql` і view `users_objects_complexes`: не мігрувати, не видаляти — лишаються в BigQuery як є, свідомо ігноруємо. Якщо десь у Looker щось досі на них посилається — не чіпати, поки не зʼявиться конкретна причина.

## 5. Реєстр метрик

✅ Конвертовано в git-friendly markdown: **`docs/metrics_registry.md`** (джерело правди). Оригінал `UrbanStack_metrics_registry.xlsx` збережено поруч як бекап.

Поточний стан **v0.2**: 13 Product, 7 Financial, 1 Operational-заглушка. Зміни v0.1→v0.2: FIN-005 виправлено (`mart_payment_rates`); PROD-008/009/010 (Стр.2/3/4) переведено з «Потребує аудиту» в «Витягнуто, потребує мапінгу» — джерело тепер указує на `looker_extracted/product/`.

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
| Стр.2, 3, 4, 5 | — | ✅ **витягнуто** — `looker_extracted/product/` (report `c2180c98`, 23 custom SQL). Точна прив'язка sql↔сторінка потребує підтвердження Артема. |

**report_id дашбордів у Looker Studio** (для майбутніх вилучень з job history): продуктовий = `c2180c98-0cf4-49af-a1d0-0ad3364cb599`, фінансовий = `ca96cfac-6fac-475f-b467-42ea4c4eaf6f`, операційний = `1a8ae601-9542-4198-be93-8ed41ca39d4f`.

## 7. Roadmap

| Фаза | Що | Статус |
|---|---|---|
| 0 | Аудит схеми, lineage, знайдені баги, реєстр v0.1 | ✅ закрито |
| 1 | Витягнути Looker custom SQL (Стр.2-5), аудит операційного дашборду, реєстр → v1.0 | 🔶 **зараз тут** — Looker SQL витягнуто ✅, схема EU сдамплена ✅, реєстр→v0.2 ✅; лишилось: мапінг sql↔метрика з Артемом, аудит опердашборду, → v1.0 |
| 2 | dbt на поточних даних: seeds → staging → intermediate → marts | 🔲 |
| 3 | Новий продуктовий дашборд: Bklit UI + shadcn/ui поверх чистих marts | 🔲 |
| 4 | Перенос уроків у мультитенантний дизайн для UrbanStack SaaS | 🔲 |

## 8. Наступні кроки (Фаза 1)

- [x] ✅ Витягнути custom SQL Стр.2-5 — зроблено інакше, ніж планувалось: не з Looker UI, а з BigQuery job history (мітка `requestor=looker_studio`). Результат у `looker_extracted/`.
- [x] ✅ Дамп `INFORMATION_SCHEMA` (EU marts + US `bigquery`) → `schema/`.
- [x] ✅ Виправлено FIN-005 у реєстрі (`mart_payment_rates`), реєстр → markdown v0.2.
- [x] ✅ `dim9000_fast` / `dim9000_analytics` — рішення: окремі внутрішні продукти, не джерела дашбордів, аудит не потрібен (план: перенести в EU).
- [ ] **Наступне:** з Артемом підтвердити прив'язку конкретний `datasource_id` (файл у `looker_extracted/product/`) ↔ метрика/сторінка Стр.2-5; заповнити реєстр до v1.0.
- [ ] Аудит операційного дашборду — вхід готовий: `looker_extracted/operational/` (report `1a8ae601`, 13 custom SQL на orders/order_tasks).
- [ ] Створити `ref_deactivated_houses` view (canonical список, 11 записів — звір повноту) і переключити всі 5 view на нього. Дані під рукою: `schema/eu_views.csv`.

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

```sql
-- Регенерувати Looker custom SQL з історії завдань (як у Фазі 1).
-- Кожен джерело даних Looker = looker_studio_datasource_id. Looker обгортає
-- custom SQL у SELECT ... FROM (<custom>) — розгортання робить looker_extracted/_raw/extract_looker.py
SELECT
  (SELECT value FROM UNNEST(labels) WHERE key='looker_studio_report_id')     AS report_id,
  (SELECT value FROM UNNEST(labels) WHERE key='looker_studio_datasource_id') AS datasource_id,
  COUNT(*) AS runs,
  ANY_VALUE(query HAVING MAX LENGTH(query)) AS longest_query,
  ANY_VALUE(ARRAY(SELECT CONCAT(rt.dataset_id,'.',rt.table_id) FROM UNNEST(referenced_tables) rt)) AS refs
FROM `region-eu`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
  AND job_type='QUERY' AND statement_type='SELECT' AND state='DONE' AND error_result IS NULL
  AND EXISTS (SELECT 1 FROM UNNEST(labels) WHERE key='requestor' AND value='looker_studio')
GROUP BY report_id, datasource_id;
```

**Сервісні аккаунти в job history** (щоб не плутати): `id-000-analytics-service-accou@analytics-454817.iam.gserviceaccount.com` — це **Stitch** (реплікація, тільки метадані-опити EVENTS_407641/primary keys), НЕ Looker. Запити дашбордів Looker ідуть під OAuth-аккаунтом власника (`nikitabulatnikov07@gmail.com`) і мітяться `requestor=looker_studio`. Ретенція JOBS_BY_PROJECT ~180 днів.
