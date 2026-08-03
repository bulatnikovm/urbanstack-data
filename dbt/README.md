# dbt — фінансовий домен UrbanStack

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

## Ключові рішення (детальніше — CLAUDE.md §9, `looker_extracted/financial/AUDIT.md`)

- **`mart_debt_years` виправлено**: оригінал рахував сирий `debt_balance`, тут — методика
  Аліони (`debt_balance − paid_amount`), вирівняно з `mart_debt_aging`. Перевірено на
  реальних даних (production: 1 "фантомний" рядок повністю сплаченого боргу → 0 рядків
  після фіксу — очікувана поведінка).
- **FIN-006 (природність оплат)** — обидві методики явно поруч: `is_natural_same_month`
  (стара, `mart_payment_rates`) і `is_natural_cohort` ("формула Артема", канонічна,
  `mart_payment_rates_cohort`).
- **`dim_space` навмисно не фільтрує деактивовані будинки/виключені ЖК** — борг за
  приміщенням у деактивованому будинку лишається реальним боргом.
- **`tascombank_merchants.private_key`** — ніде не вибирається, навіть у staging.

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
