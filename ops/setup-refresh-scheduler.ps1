# Те саме, що setup-refresh-scheduler.sh, тільки для PowerShell — бо саме
# в ньому тут працюють щодня, а bash-варіант вимагає або Git Bash, або
# синтаксису `VAR=значення команда`, якого в PowerShell просто немає (звідси
# «у меня не получается» 2026-08-30: рядок із прикладу в PowerShell
# розсипається ще на етапі розбору).
#
# Головна відмінність: токен НЕ передається змінною оточення й не пишеться
# в командний рядок. Скрипт питає його сам, прихованим вводом — тож він не
# лишається ні в історії PowerShell, ні на екрані.
#
# Навіщо все це й чому розклад не в GitHub Actions — у коментарях
# setup-refresh-scheduler.sh, повторювати не буду.
#
#   cd C:\projects\dim9000_data
#   powershell -ExecutionPolicy Bypass -File ops\setup-refresh-scheduler.ps1

$ErrorActionPreference = 'Stop'

$Project  = 'analytics-454817'
$Location = 'europe-west1'
$Job      = 'refresh-dashboard'
$Repo     = 'bulatnikovm/urbanstack-data'
$Workflow = 'refresh-dashboard.yml'
$Schedule = '0 7 * * *'
$TimeZone = 'Europe/Kyiv'

Write-Host ""
Write-Host "Потрібен fine-grained PAT на репозиторій $Repo"
Write-Host "  github.com/settings/personal-access-tokens"
Write-Host "  Repository access -> Only select repositories -> $Repo"
Write-Host "  Permissions -> Repository -> Actions -> Read and write"
Write-Host ""

$secure = Read-Host -Prompt 'Встав токен (він не буде видний)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "Порожній токен — нічого не роблю." -ForegroundColor Red
  exit 1
}

# Перевірка ДО створення задачі: інакше помилка в токені не проявиться
# ніде — задача створиться, щоранку отримуватиме 401 і мовчки нічого не
# робитиме, а дізнаємось про це аж наступного дня, смугою на дашборді.
Write-Host "Перевіряю токен..."
try {
  $null = Invoke-RestMethod -Method Get `
    -Uri "https://api.github.com/repos/$Repo/actions/workflows/$Workflow" `
    -Headers @{
      'Accept'        = 'application/vnd.github+json'
      'Authorization' = "Bearer $token"
      'User-Agent'    = 'urbanstack-setup'
    }
  Write-Host "  токен валідний, воркфлоу видно" -ForegroundColor Green
} catch {
  $code = $null
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 401) {
    Write-Host "  401: токен недійсний (протух, з помилкою або це плейсхолдер)." -ForegroundColor Red
  } elseif ($code -eq 404) {
    Write-Host "  404: токен не бачить $Repo — перевір, що він виданий саме на" -ForegroundColor Red
    Write-Host "       цей репозиторій і має право Actions." -ForegroundColor Red
  } else {
    Write-Host "  не вдалось перевірити токен: $($_.Exception.Message)" -ForegroundColor Red
  }
  exit 1
}

$uri = "https://api.github.com/repos/$Repo/actions/workflows/$Workflow/dispatches"

# ⚠️ З цієї точки й до кінця — `Continue`, а не `Stop`.
#
# `gcloud` на Windows це не exe, а `gcloud.ps1`, який усередині запускає
# python. Будь-який рядок, що python пише в stderr, PowerShell загортає в
# NativeCommandError — і при `$ErrorActionPreference = 'Stop'` це стає
# ФАТАЛЬНОЮ помилкою, навіть коли команда відпрацювала штатно. Саме на
# цьому скрипт і зупинявся 2026-08-30: `describe` неіснуючої задачі чесно
# написав «NOT_FOUND» у stderr, що було очікуваною відповіддю «задачі
# немає», а скрипт від неї помер, не дійшовши до створення.
#
# Тому нижче стан кожної команди перевіряється явно, через $LASTEXITCODE.
$ErrorActionPreference = 'Continue'

# Наявність задачі дивимось через `list`, а не `describe`: `list` повертає
# нуль і порожній вивід, коли нічого не знайшлось, тобто «немає» тут —
# нормальна відповідь, а не помилка з stderr.
$jobNames = & gcloud scheduler jobs list --location=$Location --project=$Project --format="value(name)" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Не вдалось отримати список задач Cloud Scheduler — перевір доступ до проєкту $Project." -ForegroundColor Red
  exit 1
}

$exists = $false
foreach ($name in $jobNames) {
  if ($name -match "/$Job$") { $exists = $true }
}

# ⚠️ Content-Type ЗАДАЄТЬСЯ ЯВНО. За замовчуванням Cloud Scheduler ставить
# `application/octet-stream` (перевірено на тимчасовій задачі-двійнику), а
# GitHub на такий запит чекає JSON. Ще одна тиха поломка, яку видно було б
# лише через добу.
$headers = "Accept=application/vnd.github+json,Content-Type=application/json,X-GitHub-Api-Version=2022-11-28,Authorization=Bearer $token"

# ⚠️ У `create` прапорець зветься `--headers`, а в `update` — виключно
# `--update-headers`; на `--headers` він відповідає «unrecognized arguments»
# (перевірено). Тобто перший запуск проходив би, а повторний — той, яким
# перевипускають протухлий токен, — падав би.
if ($exists) {
  $verb = 'update'
  $headerFlag = "--update-headers=$headers"
  Write-Host "Задача $Job уже є — оновлюю."
} else {
  $verb = 'create'
  $headerFlag = "--headers=$headers"
  Write-Host "Задачі $Job немає — створюю."
}

# ⚠️ Тіло запиту — ФАЙЛОМ, а не рядком `--message-body={"ref":"main"}`.
#
# PowerShell 5.1 вирізає подвійні лапки всередині аргументів, які передає
# нативній програмі: перевірено — gcloud отримав би `{ref:main}` замість
# `{"ref":"main"}`. Задача при цьому створилась би без єдиної скарги, а
# GitHub щоранку відповідав би 400 на биту JSON. Тобто зламалось би рівно
# так, як ми весь цей тиждень і ловимо: тихо.
#
# Заголовок із пробілом (`Authorization=Bearer …`) так само перевірений —
# він доїжджає цілим, бо аргументи йдуть масивом; ламаються саме лапки.
#
# `-Encoding ascii` обовʼязковий: `Set-Content` за замовчуванням у 5.1
# може дописати BOM, а BOM на початку тіла — це вже не валідний JSON.
$bodyFile = Join-Path $env:TEMP "refresh-dashboard-dispatch.json"
Set-Content -Path $bodyFile -Value '{"ref":"main"}' -Encoding ascii -NoNewline

# Аргументи масивом і виклик через `&`: у PowerShell 5.1 передача рядка зі
# ПРОБІЛОМ усередині (`Authorization=Bearer xxx`) нативній програмі —
# класичне місце, де аргумент розривається навпіл. Масив кожен елемент
# лапкує сам.
$gcloudArgs = @(
  'scheduler', 'jobs', $verb, 'http', $Job,
  "--project=$Project",
  "--location=$Location",
  "--schedule=$Schedule",
  "--time-zone=$TimeZone",
  "--uri=$uri",
  '--http-method=POST',
  "--message-body-from-file=$bodyFile",
  $headerFlag,
  '--attempt-deadline=30s',
  '--max-retry-attempts=3',
  '--min-backoff=60s',
  "--description=Щоденне оновлення дашбордів: дергає workflow_dispatch у $Repo. Розклад тут, а не в GitHub Actions - schedule там best-effort і пропускає запуски."
)

# `--format=none` не косметика: без нього `create` друкує повний YAML
# задачі, а в ньому — заголовок Authorization із токеном ВІДКРИТИМ ТЕКСТОМ.
# Тобто скрипт, який спеціально ховає ввід токена, тут же виводив би його на
# екран (і в буфер терміналу, і в скріншот, який кинуть у чат). Підсумкову
# таблицю нижче друкуємо самі — без заголовків.
$gcloudArgs += '--format=none'

& gcloud @gcloudArgs
$created = $LASTEXITCODE
Remove-Item $bodyFile -ErrorAction SilentlyContinue
if ($created -ne 0) {
  Write-Host "gcloud повернув помилку — задачу не створено." -ForegroundColor Red
  exit 1
}

Write-Host ""
& gcloud scheduler jobs describe $Job --location=$Location --project=$Project `
  --format="table(name.basename(), schedule, timeZone, state, httpTarget.uri)"

Write-Host ""
Write-Host "Перевірити зараз (запустить справжнє оновлення, ~8 хв):"
Write-Host "  gcloud scheduler jobs run $Job --location=$Location --project=$Project"
Write-Host "  gh run list --limit 3"
