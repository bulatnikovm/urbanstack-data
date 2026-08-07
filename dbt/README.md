# dbt — UrbanStack (finance / operational / surveys / product)

Перший dbt-проєкт для UrbanStack (Фаза 2). Портує `finance_dash` (BigQuery views)
в dbt-моделі, пише результат в **окремий датасет `dbt_finance`** (не чіпає
продакшн `finance_dash`/Looker).

## Навіщо

Микита будує payment scoring модель і хоче тренувати її на чистому,
задокументованому джерелі замість прямого читання Looker/BigQuery views.

## Структура

```
models/
  staging/
    finance/   — 1:1 з postgresqldim9000 (білінг/оплати/борг)
    shared/    — 1:1 з postgresqldim9000 (геоієрархія: spaces/sections/houses/complexes)
  intermediate/
    shared/    — int_space_geo: спільний геоланцюжок (реюзати й для product/operational)
  marts/
    finance/   — fct_billing/fct_debt/fct_payments (порт fact_*), dim_space/dim_llc/dim_service
                 (порт dim_*), mart_* (порт mart_*), fct_billing_monthly (НОВИЙ — головний
                 артефакт для payment scoring, grain: space_id × billing_month)
```

## Домени й датасети

| Домен | Датасет | Що покриває |
|---|---|---|
| finance | `dbt_finance` | білінг, оплати, борг, payment scoring |
| operational + surveys | `dbt_operational` | заявки/SLA, опитування/CSAT |
| **product** | **`dbt_product`** | **продуктовий дашборд: база юзерів, активація, активність, STAR, здоров'я продукту** |

Спільні `stg_shared__*` / `int_space_geo` / `int_user_space_links` /
`int_user_exclusions` живуть у `dbt_finance`, решта доменів посилається на них
крос-датасетно (BigQuery це підтримує). Механізм чистих імен датасетів —
`macros/generate_schema_name.sql`.

## Виключення користувачів — `int_user_exclusions` (спільне)

Єдиний механізм для всіх дашбордів. Грануляція `user_id × report_month`,
чотири причини: `employee` / `test_complex` / `role_deactivated` /
`house_deactivated`. Чиста база — `is_active_resident`.

Чому окрема модель: коли будинок іде з УК, жителів від квартир **навмисно не
відв'язують** (щоб мати змогу повернути), і роль їм не міняють — ЖК «Севен»
пішов рік тому, а 2 854 його жителі досі `ROLE_CITIZEN`. Тобто в даних немає
прапорця «не наш житель», рахуємо самі. Виключення похідне від
`houses.deactivated_at`, тому **оборотне автоматично** — списків людей вести
не треба.

⚠️ Будинок, деактивований 1-го числа, у цьому місяці вже не рахується.
Порівняння на рівні МІСЯЦЯ: `deactivated_at` містить час доби
(`2026-08-01 11:59:36`), тому порівнювати з timestamp'ом першого числа не можна.

Операційний домен теж на цьому механізмі: `fct_users_monthly` рахує мешканців
з `users` замість непрозорого `statistic_citizen` (той не виключав деактивовані
будинки — ЖК «Севен» пішов вер-жовт 2025, а снапшот показував 2 911 юзерів у
квіт.2026). `mart_monthly_complex_overview` бере числа звідти; колонки снапшота
лишились із суфіксом `_src` для звірки. Різниця на лип.2026: 26 895 vs 32 396.

⚠️ Числа по користувачах більше не збігаються з xlsx-звітом — він будувався на
тому ж `statistic_citizen`. Збіг по будинках (110=110) не зачеплено.

## Product-домен (2026-08-04)

Повний опис — `../docs/product_domain_design.md`. Ключове:

- **Канонічний ключ користувача — телефон** (`user_phone_sk` = sha256), НЕ
  `amplitude_id`. Останній — це установка додатку (20 064 девайси на 13 919
  телефонів) і завищує «Відвідувачів» на 22-25%. У моделях він `device_id` і
  використовується лише для метрик версій.
- **Сирий телефон не виходить за межі staging** — далі скрізь хеш.
- **`seeds/product_event_catalog.csv` — центральний артефакт домену.** Усі 135
  event_type застосунку з класифікацією (модуль / core / STAR-категорія /
  активація). Замінює 4 розбіжні списки core-подій і 2 розбіжні CASE по модулях
  з Looker. Guard-тест `assert_all_event_types_are_catalogued` падає, якщо в
  подіях з'явився тип, якого немає в seed'і.
- **Core event = ТЕРМІНАЛЬНА дія** ланцюжка (натиснув «Проголосувати», оплата
  пройшла), не «подивився/поклацав».
- `mart_user_base_monthly` (по ЖК) сумувати для тоталу НЕ можна — 1 660 юзерів
  мають приміщення в кількох ЖК. Для тоталів є `mart_user_base_totals_monthly`.

```bash
dbt build --select "models/staging/product+"
```

## Ключові рішення (детальніше — CLAUDE.md §8а/§9, `looker_extracted/financial/AUDIT.md`)

- **Канонічний борг — методика Аліони, остаточно (2026-08-03).** Підтверджено математичною
  звіркою з PDF-експортом фінансового дашборду (карточки "Дебіторка"/"Боржників усього"/
  "Борг 180+" точно збігаються з `mart_debt_alena`/`mart_debt_aging`). У `fct_billing_monthly`
  канонічні поля мають чисті імена — `debt_amount`/`is_debtor`/`debt_bucket`. Стара методика
  ("flat"/`initial_debt`) лишається лише довідково як `debt_balance_legacy`/`debt_bucket_legacy`
  — не рівноправна альтернатива.
- **`mart_debt_years` виправлено**: оригінал рахував сирий `debt_balance`, тут — методика
  Аліони, вирівняно з `mart_debt_aging`. Перевірено на реальних даних (production: 1
  "фантомний" рядок повністю сплаченого боргу → 0 рядків після фіксу — очікувана поведінка).
- **FIN-006 (природність оплат)** — обидві методики явно поруч: `is_natural_same_month`
  (стара, `mart_payment_rates`) і `is_natural_cohort` ("формула Артема", канонічна,
  `mart_payment_rates_cohort`). Підтверджено дашбордом: `repaid_old_debt_this_month`
  реально виведений на карточку "Погашено боргів минулих періодів" (точний збіг суми).
- **`dim_space` навмисно не фільтрує деактивовані будинки/виключені ЖК** — борг за
  приміщенням у деактивованому будинку лишається реальним боргом.
- **`tascombank_merchants.private_key`** — ніде не вибирається, навіть у staging.

⚠️ **Не про dbt, але знайдено при звірці:** на момент перевірки (2026-08-03) липень 2026
у `mart_debt_flat` мав лише 1 рядок замість десятків тисяч — білінг за місяць ще не
синхронізувався. Варто перевірити зі сторони білінг-системи/Stitch.

## Як запустити

```bash
cd dbt
../dbt/.venv/Scripts/dbt.exe deps   # разово, ставить dbt_utils
../dbt/.venv/Scripts/dbt.exe run
../dbt/.venv/Scripts/dbt.exe test
```

Автентифікація — через `gcloud auth application-default login` (вже налаштовано),
`~/.dbt/profiles.yml` використовує `method: oauth`.

## Верифікація

Кожна мігрована модель звірена рядок-в-рядок (COUNT + SUM ключових метрик) з
відповідним продакшн-view у `finance_dash` — усі збігаються, окрім свідомо
виправленого `mart_debt_years`.
