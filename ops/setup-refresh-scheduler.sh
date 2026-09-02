#!/usr/bin/env bash
#
# Створює (або оновлює) задачу Cloud Scheduler, яка щоранку запускає
# оновлення дашбордів через GitHub API.
#
# ── Навіщо це замість `schedule:` у GitHub Actions ────────────────────────
# `schedule` у GitHub — не гарантія, а спроба. Виміряно на цьому репозиторії:
# запуск «06:00 UTC» стабільно стартував із запізненням 40-58 хвилин (06:40,
# 06:49, 06:50, 06:58 у різні дати), 27.08.2026 стартував об 17:23 — на
# одинадцять годин пізніше, — а 28 і 29 серпня не стартував узагалі. Помилок
# при цьому немає ніде: падати нічому, запуску просто не існує.
#
# При цьому `workflow_dispatch` спрацьовує МИТТЄВО (ручний запуск 28.08:
# створено 12:47:55, зібрано й закомічено о 12:55). Тобто проблема не в
# пайплайні, не в правах і не в лімітах, а саме в черзі планувальника
# GitHub. Тому розклад переїхав туди, де він справжній, а GitHub лишився
# виконавцем.
#
# ── Чому Cloud Scheduler, а не Vercel Cron чи зовнішній пінгер ────────────
# Він уже працює в цьому ж проєкті (`analytics-454817`) — там п'ять задач,
# і ця стає шостою; до трьох задач безкоштовно, далі копійки. Vercel Cron на
# Hobby дає одну задачу на добу й теж «протягом години» — та сама хвороба.
# Зовнішній пінгер означав би токен GitHub у третьої сторони.
#
# ── Час ──────────────────────────────────────────────────────────────────
# 07:00 за Києвом (2026-09-02, на прохання операційки — раніше було 08:00).
# Повний цикл — прогін GitHub ~8 хв плюс пересборка Vercel — укладається в
# чверть години, тож о восьмій дані на екрані з запасом у 45 хвилин.
# Часовий пояс задається іменем, а не зсувом: узимку Київ переходить на
# UTC+2, і задача поїде за ним сама.
#
# Stitch-синк закінчується ~02:00 UTC (05:00 за Києвом) — тобто до восьмої
# сирі дані вже на місці.
#
# ── Токен ────────────────────────────────────────────────────────────────
# Потрібен fine-grained PAT, виданий рівно на цей репозиторій, з єдиним
# правом «Actions: read and write». Передається змінною оточення — щоб не
# лишити його ні в історії команд, ні в цьому файлі:
#
#   GH_DISPATCH_TOKEN=github_pat_… ops/setup-refresh-scheduler.sh
#
# ⚠️ Токен зберігається в заголовку задачі Cloud Scheduler, тобто його
# бачать адміни проєкту GCP. Це та сама межа довіри, що й у ключа
# сервіс-акаунта, який уже лежить у секретах GitHub. Заховати його глибше
# (Secret Manager) не вийде без проміжного сервісу: Cloud Scheduler читає
# секрети лише для автентифікації в Google API, а не для довільних
# заголовків.
#
# ⚠️ У PAT є термін дії. Коли він скінчиться, дашборд не «зламається» тихо:
# дані перестануть оновлюватись, і смуга «Дані не оновились сьогодні»
# зʼявиться наступного ж дня. Перевипустити токен і просто запустити цей
# скрипт ще раз — він уміє оновлювати наявну задачу.

set -euo pipefail

PROJECT="analytics-454817"
LOCATION="europe-west1"
JOB="refresh-dashboard"
REPO="bulatnikovm/urbanstack-data"
WORKFLOW="refresh-dashboard.yml"
SCHEDULE="0 7 * * *"
TIME_ZONE="Europe/Kyiv"

if [ -z "${GH_DISPATCH_TOKEN:-}" ]; then
  echo "Немає GH_DISPATCH_TOKEN." >&2
  echo >&2
  echo "Створи fine-grained PAT: github.com/settings/personal-access-tokens" >&2
  echo "  Repository access → Only select repositories → $REPO" >&2
  echo "  Permissions → Repository → Actions → Read and write" >&2
  echo >&2
  echo "Далі: GH_DISPATCH_TOKEN=github_pat_… $0" >&2
  exit 1
fi

URI="https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches"

# ⚠️ Content-Type задається ЯВНО: за замовчуванням Cloud Scheduler ставить
# `application/octet-stream`, а GitHub на такий запит чекає JSON. Перевірено
# на тимчасовій задачі-двійнику — без цього рядка заголовок саме octet-stream.
#
# ⚠️ І ще одне, знайдене там само: у `create` прапорець зветься `--headers`,
# а в `update` — виключно `--update-headers`; на `--headers` він відповідає
# «unrecognized arguments». Тобто перший запуск проходив би, а повторний —
# той, яким перевипускають протухлий токен, — падав би.
HEADERS="Accept=application/vnd.github+json,Content-Type=application/json,X-GitHub-Api-Version=2022-11-28,Authorization=Bearer $GH_DISPATCH_TOKEN"

# Перевірка токена ДО створення задачі.
#
# Без неї помилка в токені (не той скоуп, зайвий пробіл, скопійований
# плейсхолдер) не проявиться ніде: gcloud створить задачу, вона щоранку
# буде отримувати 401 і мовчки нічого не робити. Виявиться це аж наступного
# дня — смугою «Дані не оновились сьогодні» на дашборді.
#
# Перевіряємо читанням самого воркфлоу: якщо токен бачить його, значить він
# валідний і виданий на цей репозиторій. Права на ЗАПИС цим не
# підтверджуються — для цього є тестовий запуск у кінці.
echo "Перевіряю токен…"
code=$(curl -s -o /dev/null -w '%{http_code}'   -H "Accept: application/vnd.github+json"   -H "Authorization: Bearer $GH_DISPATCH_TOKEN"   "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW")

case "$code" in
  200) echo "  токен валідний, воркфлоу видно" ;;
  401) echo "  401: токен недійсний (протух, з помилкою або це плейсхолдер)." >&2; exit 1 ;;
  404) echo "  404: токен не бачить $REPO — перевір, що він виданий на цей" >&2
       echo "       репозиторій і має право Actions." >&2; exit 1 ;;
  *)   echo "  несподівана відповідь GitHub: $code" >&2; exit 1 ;;
esac

if gcloud scheduler jobs describe "$JOB" \
     --location="$LOCATION" --project="$PROJECT" >/dev/null 2>&1; then
  VERB="update"
  HEADER_FLAG="--update-headers=$HEADERS"
  echo "Задача $JOB уже є — оновлюю."
else
  VERB="create"
  HEADER_FLAG="--headers=$HEADERS"
  echo "Задачі $JOB немає — створюю."
fi

# `--attempt-deadline` тут про час ВІДПОВІДІ GitHub на запит (він віддає 204
# одразу), а не про тривалість самого прогону: Cloud Scheduler лише натискає
# кнопку й до результату збірки стосунку не має.
gcloud scheduler jobs "$VERB" http "$JOB" \
  --project="$PROJECT" \
  --location="$LOCATION" \
  --schedule="$SCHEDULE" \
  --time-zone="$TIME_ZONE" \
  --uri="$URI" \
  --http-method=POST \
  --message-body='{"ref":"main"}' \
  "$HEADER_FLAG" \
  --attempt-deadline=30s \
  --max-retry-attempts=3 \
  --min-backoff=60s \
  --description="Щоденне оновлення дашбордів: дергає workflow_dispatch у $REPO. Розклад тут, а не в GitHub Actions — schedule там best-effort і пропускає запуски." \
  --format=none

echo
gcloud scheduler jobs describe "$JOB" --location="$LOCATION" --project="$PROJECT" \
  --format="table(name.basename(), schedule, timeZone, state, httpTarget.uri)"

echo
echo "Перевірити зараз (запустить справжнє оновлення, ~8 хв):"
echo "  gcloud scheduler jobs run $JOB --location=$LOCATION --project=$PROJECT"
echo "  gh run list --limit 3"
