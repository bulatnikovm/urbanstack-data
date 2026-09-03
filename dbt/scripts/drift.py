"""
Аналіз ретроактивного дрейфу: як змінюються ВЖЕ ЗАКРИТІ місяці від зрізу до
зрізу. Джерело — щоденні коміти `web/data/*.json`.

Цим скриптом зроблено вимір у docs/data_drift_findings.md §A. Лишається в репо
як інструмент: коли наступного разу цифра «попливе», перше питання —
«а що показували попередні зрізи», і відповідь дістається звідси, а не з
здогадок.

Приклади:
    python dbt/scripts/drift.py mart_user_base_totals_monthly \\
        report_month_key count_potential,count_confirmed

    python dbt/scripts/drift.py mart_star_monthly \\
        star_category unique_users,star_rate_of_confirmed 2026-07

Аргументи: <mart> <key_cols_csv> <value_cols_csv> [month]
"""
import json
import subprocess
import sys
import io
from pathlib import Path

REPO = str(Path(__file__).resolve().parents[2])


def snapshots():
    """(commit, date) щоденних зрізів, від найстарішого."""
    out = subprocess.run(
        ["git", "log", "--reverse", "--format=%h|%ad", "--date=short",
         "--", "web/data/"],
        cwd=REPO, capture_output=True, text=True, check=True).stdout
    seen, res = set(), []
    for line in out.strip().splitlines():
        c, d = line.split("|")
        if d in seen:      # 8 серпня має 2 коміти — беремо останній
            res[-1] = (c, d)
        else:
            seen.add(d)
            res.append((c, d))
    return res


def load(commit, mart):
    r = subprocess.run(["git", "show", f"{commit}:web/data/{mart}.json"],
                       cwd=REPO, capture_output=True, check=False)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout.decode("utf-8"))


def main():
    mart = sys.argv[1]
    keys = sys.argv[2].split(",") if len(sys.argv) > 2 and sys.argv[2] else []
    vals = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else []
    month = sys.argv[4] if len(sys.argv) > 4 else None

    snaps = snapshots()
    series = {}          # rowkey -> {date: {val: v}}
    for commit, date in snaps:
        rows = load(commit, mart)
        if rows is None:
            continue
        for r in rows:
            if month and r.get("report_month_key") != month:
                continue
            rk = " / ".join(str(r.get(k, "")) for k in keys)
            series.setdefault(rk, {})[date] = {v: r.get(v) for v in vals}

    dates = [d for _, d in snaps]
    print(f"=== {mart}" + (f"  [{month}]" if month else ""))
    for rk, byday in sorted(series.items()):
        present = [d for d in dates if d in byday]
        if len(present) < 2:
            continue
        first, last = present[0], present[-1]
        for v in vals:
            a, b = byday[first].get(v), byday[last].get(v)
            if a is None or b is None or not isinstance(a, (int, float)):
                continue
            delta = b - a
            pct = (delta / a * 100) if a else 0
            flag = ""
            if abs(pct) >= 1:
                flag = "  <<< " + ("ЗРОСТАЄ" if delta > 0 else "ПАДАЄ")
            elif delta:
                flag = "  ." + ("+" if delta > 0 else "-")
            print(f"  {rk:<34} {v:<26} {a:>10} -> {b:>10}  "
                  f"{delta:>+8} ({pct:>+6.2f}%){flag}")


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    main()
