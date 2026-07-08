# Looker Studio — извлечённая логика (custom SQL всех дашбордов)

Источник: BigQuery job history (`region-eu.INFORMATION_SCHEMA.JOBS_BY_PROJECT`), метка `requestor=looker_studio`. Извлечено 2026-07-08.

Каждый источник данных Looker Studio = отдельный custom SQL. `passthrough` = обёртка вокруг существующего BQ-view (известная lineage); `custom` = логика, живущая только в Looker.

| Дашборд | report_id | Источников | passthrough | custom |
|---|---|---|---|---|
| financial | `ca96cfac-6fac-475f-b467-42ea4c4eaf6f` | 15 | 12 | 3 |
| operational | `1a8ae601-9542-4198-be93-8ed41ca39d4f` | 18 | 5 | 13 |
| product | `c2180c98-0cf4-49af-a1d0-0ad3364cb599` | 27 | 4 | 23 |
| report_39cd1c8c_statistic | `39cd1c8c-3dca-4f2b-9344-1b341e2bcfb6` | 9 | 6 | 3 |
| report_3e82a516_orders | `3e82a516-32b2-4534-80ff-b8db6b584a94` | 5 | 0 | 5 |
| report_4a81b2d6_masterbuh | `4a81b2d6-ad30-40c4-be18-5b659d6e9f0c` | 4 | 0 | 4 |

## Как идентифицированы дашборды

- **product** (`c2180c98`) — целевой продуктовый дашборд Фазы 1. 23 custom SQL почти все на `EVENTS_407641` (Amplitude): активація, ретеншен, core-events, phone auth, версії/ОС. Это и есть «прихована логіка Стр.2-5» (баг #4 в CLAUDE.md) в полном объёме.
- **financial** (`ca96cfac`) — 15 источников на `master_buh_*` + `tascombank_merchants`. В основном passthrough — логика уже вынесена в `finance_dash`-марты. Соответствует аккуратному состоянию финансового слоя.
- **operational** (`1a8ae601`) — 18 источников на `orders`/`order_tasks`/`tasks_locations`. 13 custom — операционный дашборд ещё не имеет вынесенных view (в отличие от финансового). Это готовый вход для аудита операционного дашборда (задача раздела 8 CLAUDE.md).
- `report_39cd1c8c` / `3e82a516` / `4a81b2d6` — вспомогательные/старые дашборды (statistic_*, orders, master_buh).

## Оговорки

- **Семантический префикс в именах файлов (`custom_retention_*`, `custom_core_events_*` и т.д.) — эвристический хинт по содержимому SQL, НЕ подтверждённая привязка к номеру страницы.** Пример: `custom_retention__aa9975c4.sql` фактически считает активацію Стр.1 (Потенційні/Підтверджені/Відвідувачі), а `custom_core_events_3__8835a9b6.sql` — разбивку платежів. Точная раскладка «SQL → номер Стр.2-5» живёт в layout Looker (в BigQuery её нет) и требует сверки с методологом (Артем). Авторитетны шапка файла (`datasource_id`, `referenced_tables`, runs) и сам SQL.
- Окно job history — 90 днів. Источники, не открывавшиеся за этот период, могли не попасть; при необходимости добить ручным fallback из Looker UI.
- **US-регион: 0 заданий Looker.** Датасет `bigquery` (US) с его retention/phone-auth views **не читается ни одним дашбордом** — осиротевшие ad-hoc наработки.
- Все извлечённые продуктовые SQL прошли `--dry_run` в BigQuery (валидны). Параметры `@DS_START_DATE`/`@DS_END_DATE` — плейсхолдеры Looker.
