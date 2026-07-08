# Реєстр метрик UrbanStack — Product / Operational / Financial

> **v0.2** · living document · джерело правди для майбутньої dbt-документації.
> Конвертовано з `UrbanStack_metrics_registry.xlsx` у git-friendly markdown 2026-07-08.
> Зміни v0.1→v0.2: (1) FIN-005 джерело виправлено на `mart_payment_rates`; (2) PROD-008/009/010 —
> Looker custom SQL витягнуто у `looker_extracted/product/`, статус оновлено.

Всього метрик: 21 · Product 13 · Financial 7 · Operational 1 (заглушка).

| ID | Домен | Метрика | Визначення | Формула / логіка розрахунку | Grain | Джерело (dataset.view) | Сторінка дашборду | dbt target (план) | Власник методології | Статус | Нотатки / відомі проблеми |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PROD-001 | Продуктовий | Потенційних користувачів | Загальна база юзерів у CRM (усі, хто хоч раз прив'язувався до приміщення) | COUNT(DISTINCT user_id), total_crm_users / total_users | complex × month | postgresqldim9000.view_monthly_active_residents | Стр.1 | fact_user_lifecycle (план) | Артем | Active | Основа для % підтверджених (PROD-004) |
| PROD-002 | Продуктовий | Підтверджені користувачі | Верифіковані юзери, що не деактивовані (verified=TRUE, role ≠ ROLE_INACTIVATED_CITIZEN) | COUNT(DISTINCT user_id) WHERE verified AND NOT deactivated | complex × month | postgresqldim9000.view_monthly_active_residents | Стр.1 | fact_user_lifecycle (план) | Артем | Active |  |
| PROD-003 | Продуктовий | Не власники (орендарі) | Юзери, прив'язані до приміщення, але не власники | tenant_users, is_owner = 0 | complex × month | postgresqldim9000.view_monthly_active_residents | Стр.1 | fact_user_lifecycle (план) | Артем | Active |  |
| PROD-004 | Продуктовий | % підтверджених | Частка підтверджених від потенційних | confirmed_users / total_users | complex × month | розраховується в Looker (calculated field) | Стр.1 | — | — | Active |  |
| PROD-005 | Продуктовий | Відвідувачі додатку | Унікальні юзери з будь-якою подією в Amplitude за місяць | COUNT(DISTINCT amplitude_id) | complex × month | postgresqldim9000.view_monthly_active_residents | Стр.1 | fact_module_usage (план) | — | Active |  |
| PROD-006 | Продуктовий | MAU / % активних | Юзери з core-подією (цільова дія) за місяць | core_active_mau / confirmed_users | complex × month | view_monthly_active_residents, vw_dm_operations_monthly | Стр.1 | fact_activation_events (план) | Артем | Active | Список core-подій задубльовано в 3 view — узгоджений, але без єдиного джерела |
| PROD-007 | Продуктовий | Сегменти Живі/Сонні/Неактивні | Активність юзера за останні 2 місяці (rolling) | segment_active / segment_sleeping / segment_simply_inactive | complex × month | postgresqldim9000.vw_dm_complex_user_segments_monthly | не на дашборді ще | fact_user_lifecycle (план) | Артем (запропонував) | Готово, не візуалізовано | View вже готовий, обговорювали на дзвінку 03.07 — лишилось додати на дашборд |
| PROD-008 | Продуктовий | Активовані / Пасивно активовані / Нові юзери | Воронка активації нових користувачів | **v0.2:** SQL витягнуто — див. `looker_extracted/product/` | user × подія | Looker custom SQL → витягнуто: `looker_extracted/product/` (report c2180c98) | Стр.2 | fact_activation_events (план) | — | Витягнуто, потребує мапінгу | **v0.2:** логіку відновлено з job history (баг #4 закрито на рівні вилучення). Кандидати — custom_* на EVENTS_407641/statistic_citizen. Точний datasource_id ↔ метрика підтвердити з Артемом. |
| PROD-009 | Продуктовий | STAR (North Star Metric) | Частка активних юзерів, що виконали цільову дію | **v0.2:** SQL витягнуто — див. `looker_extracted/product/custom_core_events_*` | complex × month | Looker custom SQL → витягнуто: `looker_extracted/product/` (report c2180c98) | Стр.4 | fact_activation_events (план) | Артем | Витягнуто, потребує мапінгу | **v0.2:** формулу відновлено. Кандидати — `custom_core_events__e242ceed`, `custom_core_events_2__da7f1d65` (EVENTS_407641 + statistic_citizen). Артем має підтвердити канонічний. |
| PROD-010 | Продуктовий | Сесії / час у модулях | Тривалість сесій і час користування кожним модулем | **v0.2:** SQL витягнуто — див. `looker_extracted/product/custom_events_usage_*` | user × module × day | Looker custom SQL → витягнуто: `looker_extracted/product/` (report c2180c98) | Стр.3 | fact_module_usage (план) | — | Витягнуто, потребує мапінгу | **v0.2:** логіку відновлено. Кандидати — `custom_events_usage_*` на EVENTS_407641. Точний datasource_id підтвердити. |
| PROD-011 | Продуктовий | Заселеність квартир | Частка квартир з прив'язаним мешканцем | occupied_apartments / total_apartments | house × month | postgresqldim9000.vw_dm_apartment_occupancy_monthly | не бачив на дашборді | dim_building (план) | — | Active |  |
| PROD-012 | Продуктовий | Розбивка по типу об'єкта | Квартира / Паркінг / Комерція, підтверджені юзери по типу | GROUP BY object_type | complex × object_type × month | postgresqldim9000.vw_dm_objects_filter | ? | dim_space (план) | — | Known issue | deactivated_houses список неповний (3 з 11, коментар "и остальные...") — не використовувати без фіксу |
| PROD-013 | Продуктовий | Churn компанії | Частка втрачених юзерів на rolling 2-міс базі | churned_users / rolling_2m_active_base | month (вся компанія) | postgresqldim9000.dm_company_churn_monthly | не бачив на дашборді | — | — | Active |  |
| FIN-001 | Фінансовий | Нарахування (charges) | Сума нарахованих квитанцій за послугу/приміщення/місяць | amount_of_charges | 1 запис нарахування | finance_dash.fact_billing / mart_billing_flat | Фінансовий деш | fact_billing | Аліона | Active |  |
| FIN-002 | Фінансовий | Оплати (payments) | Успішні транзакції оплат (status = accepted) | payment_amount, WHERE status='accepted' | 1 платіж | finance_dash.fact_payments / mart_payments_flat | Фінансовий деш | fact_payments | Аліона | Active |  |
| FIN-003 | Фінансовий | Борг — методика "flat" | Вхідний борг мінус попередні нарахування, розподілені по місяцях | debt_balance (initial_debt) | 1 запис нарахування | finance_dash.fact_debt / mart_debt_flat / mart_debt_aging | Фінансовий деш | fact_debt | ? | Потребує узгодження | Існує ПАРАЛЕЛЬНО з FIN-004 — дві різні методики боргу в системі одночасно |
| FIN-004 | Фінансовий | Борг — методика "Аліони" | Вхідний борг мінус оплати (чистіший net-борг) | debt_balance − paid_amount | space × month | finance_dash.mart_debt_alena | Фінансовий деш? | fact_debt | Аліона | Потребує узгодження | Назва натякає на колегу Аліону — уточнити, яка методика канонічна для дашборду |
| FIN-005 | Фінансовий | Природний рівень оплат | Оплати поточного місяця / нарахування попереднього місяця | SAFE_DIVIDE(payments_current, charges_previous) | complex × month | finance_dash.mart_payment_rates | Фінансовий деш | fact_payments | Артем | Active | **v0.2 fix:** джерело виправлено з legacy `mart_payments_rate` (grain ЖК×місяць) на актуальний `mart_payment_rates` (grain приміщення×послуга) — CLAUDE.md баг #3. ⚠️ Дві майже однакові назви, легко переплутати. |
| FIN-006 | Фінансовий | Дисциплінований платник | Мешканець, що повністю сплатив квитанцію за попередній місяць без боргу | ще не реалізовано в марті | space × month | план: новий mart | Фінансовий деш (план) | fact_payments | Артем | Заплановано | Визначення узгоджено на дзвінку 03.07, view ще не написано |
| FIN-007 | Фінансовий | Середній чек | Середня сума успішної оплати | AVG(payment_amount) | month | розраховується в Looker з mart_payments_flat | Фінансовий деш | — | — | Active |  |
| OPS-001 | Операційний | (поки не заповнено) | Операційний дашборд ще не аудували | — | — | — | Операційний деш | — | — | Заплановано | Наступний крок після завершення продуктового аудиту |

## Легенда

| Колонка / Статус | Опис |
|---|---|
| ID | PROD-*/FIN-*/OPS-* — короткий код метрики для посилань у документації та dbt |
| Домен | Продуктовий / Фінансовий / Операційний — до якого дашборду належить |
| Метрика | Назва, як її називають в команді |
| Визначення | Що метрика означає бізнесово, без формул |
| Формула / логіка розрахунку | Технічна логіка розрахунку — те, що потрібно перенести в dbt-модель |
| Grain | Що таке один рядок у джерелі (user×day, space×month і т.д.) — критично для уникнення багів з групуванням |
| Джерело (dataset.view) | Де фізично лежать дані зараз (BigQuery view/table, або 'Looker custom SQL' якщо не знайдено в BQ) |
| Сторінка дашборду | На якій сторінці Looker Studio метрика використовується |
| dbt target (план) | Як буде називатись fact_*/dim_* модель після міграції на dbt |
| Власник методології | Хто затверджує визначення метрики при спірних питаннях |
| Статус | Значення: |
| Active | Метрика перевірена, працює, можна довіряти цифрам |
| Потребує аудиту | Логіка існує, але не знайдена в BigQuery (швидше за все — Looker custom SQL) — потрібно витягнути й задокументувати |
| Витягнуто, потребує мапінгу | **(v0.2)** SQL відновлено з Looker job history у `looker_extracted/`, але прив'язку конкретного datasource_id ↔ метрика/сторінка ще треба підтвердити з методологом |
| Потребує узгодження | Існує кілька паралельних версій розрахунку — потрібно вибрати канонічну з Артемом/Аліоною |
| Known issue | Знайдений конкретний баг у логіці — не використовувати без фіксу |
| Заплановано | Визначення узгоджено, але ще не реалізовано технічно |
| Готово, не візуалізовано | View вже існує і коректний, просто ще не доданий на дашборд |
