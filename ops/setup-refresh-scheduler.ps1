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
$Schedule = '0 8 * * *'
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

# Перевіряємо через $LASTEXITCODE, а не $?: у PowerShell 5.1 $? після
# нативної програми буває $false навіть при коді 0 — досить, щоб вона щось
# написала в stderr, а gcloud туди пише регулярно. З $? скрипт при другому
# запуску вирішив би, що задачі немає, і впав на ALREADY_EXISTS.
gcloud scheduler jobs describe $Job --location=$Location --project=$Project 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  $verb = 'update'
  Write-Host "Задача $Job уже є — оновлюю."
} else {
  $verb = 'create'
  Write-Host "Задачі $Job немає — створюю."
}

$headers = "Accept=application/vnd.github+json,X-GitHub-Api-Version=2022-11-28,Authorization=Bearer $token"

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
  '--message-body={"ref":"main"}',
  "--headers=$headers",
  '--attempt-deadline=30s',
  '--max-retry-attempts=3',
  '--min-backoff=60s',
  "--description=Щоденне оновлення дашбордів: дергає workflow_dispatch у $Repo. Розклад тут, а не в GitHub Actions - schedule там best-effort і пропускає запуски."
)

& gcloud @gcloudArgs
if ($LASTEXITCODE -ne 0) {
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
