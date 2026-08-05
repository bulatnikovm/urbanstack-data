# Продуктовий дашборд UrbanStack

Next.js 16 + shadcn/ui + Recharts поверх `dbt_product`. Фаза 3 з `CLAUDE.md`.
План і рішення — [`../docs/dashboard_plan.md`](../docs/dashboard_plan.md).

## Як влаштовано

```
dbt build (руками, під твоїм gcloud)
  → npm run export-data     BigQuery → data/*.json  (12 mart'ів, ~1.2 MB)
  → next build              сторінка пререндериться статично
  → git push                Vercel передеплоює
```

Ні бази, ні service account, ні cron. Це свідомо: усіх даних 1.2 MB, а запуск
поки ручний. Postgres і автооновлення зʼявляться, коли підʼїдуть фінанси
(там гігабайти) — див. план, §1 і §8.

**Сторінка повністю статична** (`○ Static` у виводі білда). Наслідок: скільки б
людей її не відкрило одночасно, навантаження на щось живе — нуль.

## Команди

```bash
npm run dev            # локально
npm run export-data    # перезалити data/*.json з BigQuery
npm run refresh        # export + build
```

Автентифікація експорту — та сама ADC, що й у dbt (`gcloud auth application-default login`).

## Сторінки

Повторюють структуру оригінального Looker-дашборду — одна сторінка = одне
питання, а не всі метрики однією простинею.

| Маршрут | Сторінка | Про що | Джерела |
|---|---|---|---|
| `/` | Аудиторія (Стор. 1) | скільки нас, якість бази, розріз по ЖК, ОС | `mart_user_base_totals_monthly`, `mart_user_base_monthly`, `mart_user_segments_monthly`, `mart_version_adoption` |
| `/activation` | Активація (Стор. 2) | воронка нових, конверсія, час до цінної дії | `mart_activation_monthly`, `mart_time_to_value` |
| `/engagement` | Залученість (Стор. 3) | сесії, голосування, заявки в додатку, модулі, відвал, версії | `mart_engagement_monthly`, `mart_module_usage_monthly`, `mart_module_retention`, `mart_user_segments` |
| `/star` | STAR (Стор. 4) | North Star у часі + 7 категорій | `mart_star_monthly` |
| `/health` | Стан додатку (Стор. 5) | **заглушка** — дані є, графіки відкладені | `mart_app_health_weekly` |

## Структура

| Файл | Що |
|---|---|
| `scripts/export-data.mjs` | експорт з BigQuery. `MANIFEST` у ньому — **єдине місце**, де записано, що саме їде на дашборд |
| `data/*.json` | вивантажені mart'и, комітяться в репо (це і є «зріз») |
| `lib/data.ts` | типізоване читання + `getPeriod()` (спільна логіка періоду для всіх сторінок) |
| `lib/format.ts` | українські числа/дати |
| `components/trend-charts.tsx` | графіки на shadcn `ChartContainer` (клієнтські) |
| `components/ranked-bars.tsx` | рейтинги — чистий HTML, серверний компонент |
| `components/dashboard.tsx` | секції, KPI, панелі, бейдж свіжості |
| `components/app-sidebar.tsx` | навігація |
| `components/charts/` | Bklit UI (реєстр `@bklit`) |
| `components/bklit-donut.tsx` | пончики на Bklit `PieChart`, з власним `PieCenter` (див. нижче чому) |
| `auth.ts` / `auth.config.ts` | Auth.js — Google OAuth + allowlist, без бази |
| `proxy.ts` | захист сторінок — редірект на `/login` до рендеру |
| `app/(dashboard)/` | усі сторінки дашборду, за `proxy.ts` |
| `app/login/` | екран входу, поза route group — без сайдбара |

## Період і фільтр дат

Діапазон живе в **URL** (`?from=2024-01&to=2026-08`), не в стані компонента:
посилання на конкретний період можна переслати, і воно відкриється тим самим.
Резолвиться один раз у `getPeriod()` — межі даних відомі лише там.

**Пікер помісячний, не поденний.** Усі марти мають грануляцію `report_month`;
поденний календар обіцяв би точність, якої в даних немає.

Ціна: сторінки стали динамічними (`ƒ` замість `○`) — `searchParams` це
вимагає. Рендер іде з локального JSON, тому це мілісекунди й жодного
зовнішнього виклику; властивість «глядачі не навантажують BigQuery»
збережена.

## Рішення, які легко зламати назад

- **Показуємо ПОТОЧНИЙ місяць, включно з незавершеним** (рішення Микити
  2026-08-05 — потрібен стан «як зараз»). Наслідок: 5 серпня всі місячні
  лічильники в ~6 разів менші за липневі й дельти в мінусі. Тому в шапці є
  позначка «місяць триває · 5 з 31 днів» — прибирати її не можна, інакше це
  читається як обвал.
- **Воронка активації має ДВІ категорії, не три.** У марті
  `count_activated + count_passively_activated == count_new_users` тотожно
  (залишок = 0 у кожному місяці) — «Без активності» була категорією, якої не
  існує.
- **Розподіл по ОС — з `agg_os_monthly`, не з `mart_version_adoption`.**
  В останнього грануляція міс × ОС × ВЕРСІЯ; сума `active_users` по версіях
  рахує двічі того, хто за місяць був на двох версіях (iOS 6 080 замість
  5 153, +18%).
- **`LabelList` з Recharts 3 не рендериться** — перевірено двічі, у чистому
  бандлі теж. Підписи значень робимо або HTML-ом (`ranked-bars.tsx`), або
  окремим графіком.
- **Bklit `<PieCenter>` ламає гідратацію.** `ChartStatFlow` вирішує
  статичний текст чи `<NumberFlow>` через
  `useState(() => customElements.get("number-flow-react"))`: на сервері
  `customElements` немає → `false` → текст; у браузері на першому рендері
  custom element уже зареєстрований на імпорті модуля → `true` → інше
  дерево. React кидає "Hydration failed" (підтверджено в консолі — числа
  прямо в тексті помилки не збігались). Тому `bklit-donut.tsx` має власний
  `PieCenter` — ту саму назву функції `PieChart` розпізнає по
  `isPieCenter()` (перевіряє `.displayName`/`.name`, не референс), тож
  підміна підхоплюється в той самий grid-слот без жодних змін у bklit-коді.
- **Bklit `<PieChart>` без `size` не рендериться в наших макетах.**
  `PieChartInner` має захист `if (size < 10) return null`; без `size` він
  міряє контейнер через visx `ParentSize`, а всередині flex-колонки з
  `items-center` (пончик + легенда під ним) контейнер ніколи не отримує
  визначеної ширини — міряється в 0 назавжди. Задаємо `size` пікселями
  напряму. `innerRadius`/`hoverOffset` там теж пікселі, не частка 0–1 (на
  відміну від shadcn-версії) — легко переплутати вдруге.
- **Вікно від першого місяця бази.** У `mart_activation_monthly` є когорти
  `2010-01` і `2022-06` (по 1 користувачу — зіпсований `created_at` у джерелі).
  Без обрізання вісь розтягується на 16 років.
- **Службовий рядок `report_month_key = "ALL"`** у `mart_time_to_value` — це
  підсумок за весь час, не місяць. У часовий ряд не потрапляє.
- **Максимум 3 категоріальні серії**, кольори не циклимо. STAR має 7 категорій —
  тому це рейтинг, а не 7 ліній на одному графіку.
- **Жодних двох осей Y.**
- Палітра — валідовані слоти з dataviz-довідника (`globals.css`, worst CVD ΔE 9.2).
- `RankedBars` навмисно не на Recharts: `LabelList` не доїжджає в браузерний
  бандл Recharts 3, та й HTML для списку «підпис — смуга — значення» кращий.
- **Шрифт підключається через `--font-sans` / `--font-mono`, не через
  `--font-geist-*`.** `globals.css` містить `@theme inline { --font-sans:
  var(--font-sans) }` — Tailwind бере токен з CSS-змінної з тим самим іменем.
  Скафолдне `--font-geist-sans` її не визначає, `font-sans` не резолвиться, і
  вся сторінка падає на серифний дефолт браузера. Це виглядало як «дашборд у
  Word». Не перейменовувати назад.
- Ця версія shadcn — на Base UI: композиція через `render={<Link/>}`, а не
  `asChild`. З `asChild` проп протікає в DOM і React лається в консоль.

## Три правки в `components/ui/chart.tsx`

Файл shadcn, але змінений локально (це нормально — shadcn копіює код у проєкт).
Обидві правки зникнуть при `shadcn add chart --overwrite`, тому вони тут:

1. **`valueFormatter`** на `ChartTooltipContent`. Штатний `formatter` підміняє
   рядок тултипа **цілком** — разом із маркером і назвою серії, тож тултип
   перетворюється на стовпчик чисел без підписів. `valueFormatter` форматує
   лише число, лишаючи «● Потенційні · 25 020».
2. **`debounce` (120 мс)** на `ResponsiveContainer`. Сайдбар анімує ширину
   200 мс; без дебаунсу кожен графік переміряється й перемальовується на
   кожному кадрі анімації — згортання сайдбара помітно гальмувало.
3. **`gap-6`** у рядку тултипа. `justify-between` сам по собі проміжку не
   гарантує: довга назва серії стикалась із числом впритул
   («Підтверджені12 939»).

Заголовок тултипа форматує `monthTooltip()` («Черв. 2026»), а не `monthShort()` —
останній лишається для підписів осі, де потрібно коротко.

## Авторизація (Auth.js v5, без бази)

Google-логін + allowlist в env-змінних — без Postgres, без власної
реєстрації/паролів (план, §4). Захист двошаровий:

- `proxy.ts` (Next 16; був `middleware.ts` — конвенцію перейменували)
  редіректить неавторизованих на `/login` ДО рендеру сторінки;
- `app/(dashboard)/layout.tsx` — усі сторінки дашборду в route group, окремо
  від `/login`, щоб неавторизований глядач не бачив сайдбар на екрані входу.

**Роль поки лише `admin`/`viewer`** (`ADMIN_EMAILS` — підмножина
`ALLOWED_EMAILS`). Гранулярні ролі (product/operations/finance) — Фаза E,
коли підʼїде другий дашборд.

### Як увімкнути (нічого не працює без цього)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   тип **Web application**.
2. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (локально)
   - `https://<домен-на-vercel>/api/auth/callback/google` (прод, додати
     пізніше, коли буде відомий домен)
3. Скопіювати `.env.local.example` → `.env.local`, заповнити:
   - `AUTH_SECRET` — `npx auth secret` або `openssl rand -base64 33`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — з кроку 1
   - `ALLOWED_EMAILS`, `ADMIN_EMAILS` — через кому
4. На Vercel ті самі змінні через **Project Settings → Environment
   Variables** — `AUTH_SECRET` там окремий, не той, що локально.

Без `.env.local` логін впаде на `Configuration` error — це очікувано, ще не
підключені креди, а не баг коду. Уся решта (типи, збірка, `proxy.ts`)
перевірена без живого OAuth-обміну.

## Що далі

- Bklit UI на решту графіків (герой-графіки на Аудиторії, STAR) — поки
  задіяний тільки на пончиках
- Service account + автооновлення щоночі (2:00 Stitch → BigQuery →
  6:00 dbt build → export → редеплой) — свідомо відкладено, доки немає
  service account (план, §9)
- Деплой на Vercel
- Секція 5: аномалії та інсайти
