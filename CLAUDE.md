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

1. **`deactivated_houses` drift — виявився ширшим, ніж у Фазі 0.** Початково: хардкод-список задубльований у 4+ product views з розбіжністю (10 записів у `view_monthly_active_residents`/`vw_dm_complex_user_segments_monthly`, 11 у `vw_dm_apartment_occupancy_monthly`/`vw_dm_operations_monthly`, лише **3 з 11** у `vw_dm_objects_filter`). Аудит операційного дашборду (Фаза 1) показав ще гірше: у Looker custom SQL співіснують **4 різні механізми** виключення домів/ЖК одночасно — (a) статичний список 10 UUID, (b) повна відсутність фільтра у 2 запитах, (c) окремий список 3 ЖК-UUID спільний із продуктовою стороною, (d) окремий рядковий механізм по назві ЖК+номеру будинку лише в одному запиті (реальні адреси підтверджено: Варшавський=вул.Крістерів, Севен=Дніпровська набережна, Ліпінка=вул.Замковецька). **Підтверджено прямим читанням `vw_dm_operations_monthly`:** канонічний механізм — `house_deactivation_dates` (CTE з реальними датами деактивації, **11** UUID), і в ньому є будинок (`f94470ce…`, деактивовано 2025-12-01), якого **немає** в жодному з 10-записних хардкод-списків operational Looker SQL — точне підтвердження дрейфу, не здогадка. ✅ буд.108 (вул.Замковецька, ЖК "Ліпінка") — беклог позначав як "тест деактивації" (не фінально), але Микита підтвердив (2026-07-09): будинок деактивовано, виключення в `custom_occupancy__8677b241.sql` коректне. **Рішення (Микита, 2026-07-09): фікс структурної проблеми (4 механізми виключення) відкладено до dbt-фази** — проміжний `ref_deactivated_houses` view робити не будемо. Деталі — `looker_extracted/operational/AUDIT.md`.
2. ✅ **Переосмислено після аудиту фінансового дашборду (2026-07-09).** Це не "дві конфліктуючі методики без рішення" — це **міграція в процесі**, задокументована прямо в коді views (коментарі `>>> ЗМІНА`, `★ НОВЕ ПОЛЕ`): методика Аліони (`debt_balance − paid_amount`) вже прийнята як нова канонічна (`mart_debt_alena`, і `mart_debt_aging` — обидва явно позначені "за НОВОЮ формулою"). `mart_debt_flat` навмисно тримає обидві цифри поруч для перехідного порівняння. ⚠️ **Реальна неузгодженість:** `mart_debt_years` (аналогічний до `mart_debt_aging` розподіл боргу, тільки по роках) **не перейшов** на методику Аліони — досі на сирому `debt_balance`. Плюс FIN-006 ("Дисциплінований платник") виявився частково реалізованим: стара same-month методика в `mart_payment_rates.is_natural` + нова "формула Артема" (когортна, X→X+1) в `mart_payment_rates_cohort.is_natural`, з прямою вказівкою в коді перейти на другу. Деталі — `looker_extracted/financial/AUDIT.md`.
3. ✅ **Закрито (реєстр v0.2).** `mart_payment_rates` vs `mart_payments_rate` — `mart_payment_rates` (grain: приміщення × послуга) **актуальний**, `mart_payments_rate` (grain: ЖК × місяць) — **legacy**. FIN-005 у реєстрі виправлено на `mart_payment_rates`. Ризик плутанини через схожі назви лишається — тримати в голові при пошуку.
4. ✅ **Закрито повністю (Фаза 1).** Прихована логіка Looker (Стр.2-5) відновлена з BigQuery job history — див. `looker_extracted/`. **Усі** джерела даних Looker виявились custom SQL (не таблиці): продуктовий дашборд (`report_id c2180c98`) = 27 джерел, 23 custom на `EVENTS_407641` (активація/ретеншен/core-events/phone-auth). Прив'язка sql↔сторінка підтверджена (PDF-експорт + Микита як автор дашборду, не Артем — питання про *вміст дашборду* адресуються Микиті, Артем лише методолог бізнес-визначень). Деталі — `looker_extracted/product/_index.md`.
5. ✅ **Закрито:** `iban` у джерелі `dim_llc` (`tascombank_merchants WHERE purpose='payment'`) унікальний — перевірено запитом, fan-out ризику при джойнах немає.
6. ✅ **Закрито:** `postgresql` емпірично підтверджений мертвим (останній sync 2025-04-29 проти сьогоднішнього sync `postgresqldim9000`).
7. ✅ **Закрито.** Рішення по `amlitude_EU`, `postgresql` і view `users_objects_complexes`: не мігрувати, не видаляти — лишаються в BigQuery як є, свідомо ігноруємо. Якщо десь у Looker щось досі на них посилається — не чіпати, поки не зʼявиться конкретна причина.
8. ✅ **Закрито (Фаза 1, аудит операційного дашборду).** Прочитано всі 18 Looker-джерел (`report_id 1a8ae601`) — див. `looker_extracted/operational/AUDIT.md`. Знахідки, окрім розширення бага #1 (п.1): словник перекладу категорій заявок задубльовано **тричі** з розбіжністю (`intercom_and_video`) — кандидат на dbt seed `dim_order_category`; третя (окрім двох продуктових) паралельна методика "confirmed/active user" знайдена в покинутому запиті — не критично, не на дашборді. Хардкод "Севен" (518/2100) — виявився в **застарілому, вже неживому** Looker-джерелі (`custom_active_users__5cd58443.sql`, Стр.1 замінено на `vw_dm_operations_monthly`) — не впливає на поточні цифри дашборду.
9. ✅ **Закрито (Фаза 1, крос-перевірка з "Backlog Дешбордів.xlsx").** Микита надав файл з авторським описом бізнес-логіки кожної метрики продуктового/операційного/фінансового дашбордів (лист "Технічний" і інвесторський звіт — поза скоупом). Дозволило підтвердити ~90% раніше знайденого SQL-мапінгу і закрити 5 unconfirmed operational-джерел (`d7ed1d25`, `e7906ec1`, `a4f3efef` — усі виявились живими, `2c8667f1` — імовірно застаріла ітерація). Знайдено 2 розбіжності документація↔SQL: (а) буд.108 "Ліпінка" — ✅ закрито, Микита підтвердив деактивацію (див. п.1); (б) **відкрито** — "Особові рахунки" на Стр.3 операційного мали б включати комерцію/паркінг/комори, а SQL рахує лише квартири — цифра (26 786) імовірно занижена, розбираємось. На продуктовій стороні підтверджено канонічну методику біометрії (Стр.5): `custom_phone_auth_3__63b36903.sql` — нова, повніша версія (3 метрики включно з "Fallback to PIN"), `custom_retention_3__b3c2e647.sql` — застаріла (2 метрики). Деталі — `looker_extracted/operational/_index.md` і `looker_extracted/product/_index.md`.

## 5. Реєстр метрик

✅ Конвертовано в git-friendly markdown: **`docs/metrics_registry.md`** (джерело правди). Оригінал `UrbanStack_metrics_registry.xlsx` збережено поруч як бекап.

Поточний стан **v1.3**: 13 Product, 7 Financial, 18 Operational = 38 метрик. Operational-розділ пройшов 3 ітерації уточнення (v1.0→v1.2, деталі — `looker_extracted/operational/_index.md`). v1.3 додав аудит фінансового дашборду (`looker_extracted/financial/AUDIT.md`) — переосмислено баг #2 (методика Аліони вже канонічна, знайдено конкретну неузгодженість `mart_debt_years`), FIN-006 виявився частково реалізованим.

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
| `dm_company_churn_monthly` | month (вся компанія) | churn — **графік був на дашборді, прибраний** (підтверджено Микитою); джерело лишилось підключеним у Looker |
| Стр.2, 3, 4, 5 | — | ✅ **витягнуто й прив'язка підтверджена** — `looker_extracted/product/` (report `c2180c98`, 27 джерел, 23 custom SQL). Метод і повна таблиця — `looker_extracted/product/_index.md`. |

**report_id дашбордів у Looker Studio** (для майбутніх вилучень з job history): продуктовий = `c2180c98-0cf4-49af-a1d0-0ad3364cb599`, фінансовий = `ca96cfac-6fac-475f-b467-42ea4c4eaf6f`, операційний = `1a8ae601-9542-4198-be93-8ed41ca39d4f`.

## 7. Roadmap

| Фаза | Що | Статус |
|---|---|---|
| 0 | Аудит схеми, lineage, знайдені баги, реєстр v0.1 | ✅ закрито |
| 1 | Витягнути Looker custom SQL (Стр.2-5), аудит операційного дашборду, реєстр → v1.0 | ✅ **закрито** (2026-07-09) — Looker SQL витягнуто й прив'язку підтверджено, схема EU сдамплена, аудит операційного дашборду завершено, реєстр → v1.0 (29 метрик) |
| 2 | dbt на поточних даних: seeds → staging → intermediate → marts | 🔶 **старт з фінансового домену** (2026-08-03) — див. розділ 8а |
| 3 | Новий продуктовий дашборд: Bklit UI + shadcn/ui поверх чистих marts | 🔲 |
| 4 | Перенос уроків у мультитенантний дизайн для UrbanStack SaaS | 🔲 |

## 8. Фаза 1 — підсумок (✅ закрито 2026-07-09)

- [x] Витягнути custom SQL Стр.2-5 — зроблено інакше, ніж планувалось: не з Looker UI, а з BigQuery job history (мітка `requestor=looker_studio`). Результат у `looker_extracted/`.
- [x] Дамп `INFORMATION_SCHEMA` (EU marts + US `bigquery`) → `schema/`.
- [x] Виправлено FIN-005 у реєстрі (`mart_payment_rates`).
- [x] `dim9000_fast` / `dim9000_analytics` — рішення: окремі внутрішні продукти, не джерела дашбордів, аудит не потрібен (план: перенести в EU).
- [x] Прив'язка sql↔сторінка для Стр.2-5 підтверджена (PDF-експорт + Микита).
- [x] Аудит операційного дашборду завершено — `looker_extracted/operational/AUDIT.md`. Фікс знахідок (баг #1 у ширшому вигляді, хардкод "Севен", дрейф словника категорій) свідомо відкладено до dbt-фази.
- [x] Реєстр метрик → **v1.0** (29 метрик, Operational-розділ заповнено).

**Наступний крок — Фаза 2 (dbt).** Відкриті технічні рішення, які треба прийняти на старті:
- `deactivated_houses`/`excluded_complexes`: гібрид — `houses.status='deactivated'` фільтр для нових деактивацій + перевірити, чи бекфілені 10 legacy-UUID (якщо ні — мінімальний seed лише для них).
- `dim_order_category`/`dim_order_type` seed — консолідувати 3 розбіжні копії словника (OPS-003).
- Уточнити в Микити контекст хардкоду "Севен" (518/2100) перед міграцією (OPS-006).
- Уніфікувати 3 паралельні методики "confirmed/active user" (продукт ×2 + operational, OPS-007) — можливо, разом з Артемом, якщо йдеться про канонічне бізнес-визначення.

## 8а. Фаза 2 — старт: dbt для фінансового домену (2026-08-03)

Мотивація: Микита будує payment scoring модель, потрібне чисте dbt-джерело замість прямого читання Looker/BigQuery views. Обрано фінансовий домен першим (найменший ризик, `finance_dash` уже мав чисту dim/fact/mart конвенцію — див. §9).

- [x] dbt-core 1.12.0 + dbt-bigquery встановлено (`dbt/.venv`), автентифікація — `gcloud auth application-default login` (`method: oauth`, без сервісного акаунту).
- [x] Проєкт `dbt/` — **пише в окремий датасет `dbt_finance`**, не чіпає продакшн `finance_dash`/Looker.
- [x] Повний ланцюжок сирі джерела (`postgresqldim9000.master_buh_service_payment`/`master_buh_service`/`master_buh_information`/`tascombank_merchants`/`operations`/`transactions` + геоієрархія `spaces→sections→houses→complexes`) → staging → `int_space_geo` (спільний, реюзати для product/operational) → fact/dim → mart. Кожна модель **звірена рядок-в-рядок** (COUNT+SUM) з відповідним `finance_dash`-view — 100% збіг.
- [x] **Фікс `mart_debt_years`**: оригінал рахував сирий `debt_balance`, тепер — методика Аліони (вирівняно з `mart_debt_aging`). Перевірено на реальних даних: production мав 1 "фантомний" рядок (борг = оплата, тобто вже сплачено) → 0 рядків після фіксу, як і очікувалось.
- [x] **FIN-006 перенесено з обома методиками явно**: `is_natural_same_month` (стара) і `is_natural_cohort` ("формула Артема", канонічна) — рішення користувача: не видаляти стару, показати обидві.
- [x] **Новий факт `fct_billing_monthly`** (grain: `space_id × billing_month`) — головний артефакт для payment scoring. Агрегує білінг/оплати/борг (обидві методики) з рівня space×service×month. Точково звірений вручну (сума по послугах = агрегат).
- [x] `tascombank_merchants.private_key` — підтверджено, ніде не вибирається (навіть у staging).
- ⚠️ `dim_space` **навмисно не фільтрує** деактивовані будинки/виключені ЖК (на відміну від product/operational) — борг за приміщенням у деактивованому будинку лишається реальним боргом. Рішення зафіксоване, не помилка.

Деталі, структура моделей і команди запуску — `dbt/README.md`.

**Далі:** product/operational dbt-моделі (зможуть переюзати `int_space_geo`) — коли Микита буде готовий; або продовжити поглиблення фінансового домену (більше mart'ів/фіч для scoring, коли стане зрозуміло, чого бракує моделі).

## 9. Вже прийняті рішення

- Хардкод-списки (`excluded_complexes`, `deactivated_houses`, список "core events", `dim_order_category`/`dim_order_type`) → **dbt seeds**, не copy-paste між моделями — структурно унеможливлює баг #1 та його операційний аналог (словник категорій заявок, 3 копії з розбіжністю). **Рішення 2026-07-09: жодного проміжного BigQuery view (`ref_deactivated_houses`) до dbt не робимо** — фікс лише в dbt-фазі, щоб не переробляти двічі.
  - **Підтверджено Микитою:** `houses.status = 'deactivated'` — надійне поле, але **тільки для домів, деактивованих після появи цього поля**. Для 10 хардкод-домів дату деактивації Микита виставляв вручну заднім числом, бо поля тоді не існувало — вони можуть НЕ мати `status='deactivated'` зараз (ретроактивно не бекфілили). План для dbt: перевірити SQL-запитом, чи всі 10 UUID мають цей статус зараз; якщо ні — гібрид (`status`-фільтр для нових + невеликий seed лише для legacy-домів, а не повний список).
- Спільний intermediate `int_space_geo` для ланцюжка `spaces → sections → houses → complexes`, який зараз повторюється практично в кожному запиті (і в finance_dash, і в продуктових views, і в операційних Looker custom SQL).
- ЖК "Севен" має захардкожені числа (518/2100 юзерів за вер-жовт 2025) — знайдено в `custom_active_users__5cd58443.sql`, але це джерело вже **застаріле** (Стр.1 операційного замінено на `vw_dm_operations_monthly`, без хардкоду). Не блокує dbt, але контекст (чому взагалі знадобився патч) варто зберегти, якщо спливе деінде.
- `finance_dash` переноситься в dbt майже 1:1 (найменший ризик, хороший перший PR — вже має правильну dim/fact/mart конвенцію).
- Продуктова сторона (`vw_dm_*` монолiти) потребує повного рефакторингу в `fact_user_lifecycle` / `fact_activation_events` / `fact_module_usage`.
- Фаза 3: **Bklit UI + shadcn/ui разом**, не тільки Bklit — взяти найкраще з обох.

## 10. Люди

- **Артем** — CEO/засновник, methodology owner для продуктових KPI (STAR, core events), приймає рішення по неоднозначних метриках.
- **Максим** — PM.
- **Аліона** — фінансові дані; її методика розрахунку боргу (`mart_debt_alena`) потребує узгодження зі старою (`mart_debt_flat`).
- **Микита** (я) — sole data/analytics lead, автор усього стеку.

**"Backlog Дешбордів.xlsx"** — авторська документація бізнес-логіки кожної метрики (окремі листи Продуктовий/Операційний/Фінансовий/Технічний/Аналітичний звіт по заявкам DIM для інвесторів). Джерело правди вищого рівня, ніж SQL, — використовувати для крос-перевірки при подальших аудитах чи dbt-міграції (напр. коли треба зрозуміти *намір*, а не тільки поточну реалізацію). Файл лежить у Микити локально (не в репо) — просити при потребі.

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
