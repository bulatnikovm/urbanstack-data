"""
Базова лінія для `srv_metric_revisions` з git-історії.

Навіщо. `srv_metric_revisions` запам'ятовує значення закритого місяця при
ПЕРШІЙ появі й далі стежить, чи воно не поїхало. Тобто з нуля модель стає
корисною тільки через кілька тижнів спостережень — а до того мовчить.

Але спостереження вже є: `web/data/*.json` комітяться щодня з 2026-08-05.
Це готові щоденні зрізи тих самих mart'ів. Беремо НАЙСТАРІШИЙ і кладемо його
як first_value — і детектор ревізій починає працювати з історією одразу.

Мапінг метрик береться з того самого seed'а `product_metric_series.csv`, що й
у `srv_metric_timeseries` — щоб базова лінія не могла розійтись із рядами.

Запуск (одноразово, з кореня репо):
    python dbt/scripts/build_revision_baseline.py

Створює `analytics-454817.dbt_product.product_metric_baseline`.
Далі: dbt build --select srv_metric_revisions --full-refresh
"""

import csv
import json
import subprocess
import sys
from pathlib import Path

from google.cloud import bigquery

REPO = Path(__file__).resolve().parents[2]
SEED = REPO / "dbt" / "seeds" / "product_metric_series.csv"
PROJECT = "analytics-454817"
TABLE = f"{PROJECT}.dbt_product.product_metric_baseline"

# Як зветься колонка з назвою розрізу в кожному марті. Дзеркалить
# srv_metric_timeseries — інших розрізів у seed'і немає.
DIMENSION_COLUMN = {
    "total": None,                      # один ряд на місяць
    "complex": "complex_name",
    "star_category": "star_category",
    "module": "module_name_ua",
}
TOTAL_LABEL = "Усього"

# Та сама межа, що в srv_metric_timeseries.
MIN_MONTH = "2024-01"


def oldest_snapshot() -> tuple[str, str]:
    """(commit, date) найстарішого коміту, що містить web/data."""
    out = subprocess.run(
        ["git", "log", "--reverse", "--format=%h|%ad", "--date=short",
         "--", "web/data/"],
        cwd=REPO, capture_output=True, text=True, check=True).stdout
    commit, date = out.strip().splitlines()[0].split("|")
    return commit, date


def load_json(commit: str, mart: str):
    r = subprocess.run(["git", "show", f"{commit}:web/data/{mart}.json"],
                       cwd=REPO, capture_output=True, check=False)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout.decode("utf-8"))


def main() -> int:
    # Консоль під Windows за замовчуванням cp1251 — українські назви ЖК і
    # символи в логах інакше валять скрипт на print(), а не на роботі з даними.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    commit, date = oldest_snapshot()
    print(f"базова лінія: коміт {commit} від {date}")

    with SEED.open(encoding="utf-8") as fh:
        series = list(csv.DictReader(fh))

    cache: dict[str, list | None] = {}
    rows: list[dict] = []
    missing: list[str] = []

    for s in series:
        mart = s["model_name"]
        if mart not in cache:
            cache[mart] = load_json(commit, mart)
        data = cache[mart]
        if data is None:
            missing.append(mart)
            continue

        dim_col = DIMENSION_COLUMN[s["dimension_key"]]
        for r in data:
            month = r.get("report_month_key")
            if not month or month < MIN_MONTH:
                continue
            value = r.get(s["value_column"])
            if value is None:
                continue
            rows.append({
                "series_key": s["series_key"],
                "dimension_value": r[dim_col] if dim_col else TOTAL_LABEL,
                "report_month_key": month,
                "baseline_value": float(value),
                "baseline_date": date,
            })

    if missing:
        # Не падаємо: марта могло не бути в найстарішому зрізі (його додали
        # пізніше). Такі ряди просто почнуть історію з першого dbt-прогону.
        print(f"⚠ немає у зрізі, пропущено: {sorted(set(missing))}")

    print(f"рядків базової лінії: {len(rows)}")

    client = bigquery.Client(project=PROJECT)
    job = client.load_table_from_json(
        rows, TABLE,
        job_config=bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            schema=[
                bigquery.SchemaField("series_key", "STRING"),
                bigquery.SchemaField("dimension_value", "STRING"),
                bigquery.SchemaField("report_month_key", "STRING"),
                bigquery.SchemaField("baseline_value", "FLOAT"),
                bigquery.SchemaField("baseline_date", "DATE"),
            ],
        ),
    )
    job.result()
    print(f"✓ завантажено в {TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
