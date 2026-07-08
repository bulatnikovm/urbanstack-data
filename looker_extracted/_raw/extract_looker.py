import json, re, os, datetime
SP=r"C:\Users\nikit\AppData\Local\Temp\claude\C--projects-dim9000-data\ea5c6ded-2542-4127-9f91-f2c903f1cca9\scratchpad"
ROOT=r"C:\projects\dim9000_data\looker_extracted"
eu=json.load(open(SP+r"\looker_ds_eu.json",encoding='utf-8'))

TODAY=datetime.date.today().isoformat()

REPORTS={
 "c2180c98-0cf4-49af-a1d0-0ad3364cb599":"product",      # продуктовый (Стр.1-5)
 "ca96cfac-6fac-475f-b467-42ea4c4eaf6f":"financial",    # финансовый (master_buh)
 "1a8ae601-9542-4198-be93-8ed41ca39d4f":"operational",  # операционный (orders/tasks)
 "39cd1c8c-3dca-4f2b-9344-1b341e2bcfb6":"report_39cd1c8c_statistic",
 "4a81b2d6-ad30-40c4-be18-5b659d6e9f0c":"report_4a81b2d6_masterbuh",
 "3e82a516-32b2-4534-80ff-b8db6b584a94":"report_3e82a516_orders",
}

def is_wrapper(q):
    # Looker-generated wrapper: SELECT of clmn/t0 aliases immediately over FROM ( ... )
    head=q[:q.lower().find("from (")] if "from (" in q.lower() else ""
    if not re.search(r"\bfrom\s*\(", q, re.I): return False
    return ("clmn" in head) or bool(re.search(r"\bt0\.", head)) or head.strip().lower()=="select *"

def unwrap_once(q):
    m=re.search(r"\bfrom\s*\(", q, re.I)
    if not m: return q.strip()
    i=m.end()-1; depth=0; start=i+1
    for j in range(i,len(q)):
        c=q[j]
        if c=='(':depth+=1
        elif c==')':
            depth-=1
            if depth==0: return q[start:j].strip()
    return q.strip()

def full_unwrap(q):
    q=(q or "").strip()
    for _ in range(6):
        if is_wrapper(q):
            inner=unwrap_once(q)
            if inner==q: break
            q=inner
        else: break
    return q.strip()

PASS_RE=re.compile(r"^select\s+.*?\sfrom\s+`analytics-454817\.([a-z0-9_]+)\.([A-Za-z0-9_ ]+)`\s*(as\s+t0)?\s*$",re.I|re.S)
def passthrough_target(q):
    # pure SELECT cols FROM `proj.ds.obj` with no join/where/group
    ql=q.lower()
    if any(k in ql for k in [" join "," where "," group by "]): return None
    m=re.match(r"^\s*select\s+.*?\sfrom\s+`analytics-454817\.([a-z0-9_]+)\.([A-Za-z0-9_ ]+)`\s*(as\s+t0)?\s*;?\s*$",q,re.I|re.S)
    if m: return f"{m.group(1)}.{m.group(2).strip()}"
    return None

KEYWORDS=[
 ("retention",     [r"day_offset",r"date_diff.*day",r"cohort",r"retention"]),
 ("phone_auth",    [r"auth_pin",r"phone_auth",r"authoris",r"auth_"]),
 ("version_os",    [r"version_name",r"os_type",r"platform"]),
 ("churn",         [r"churn"]),
 ("segments",      [r"segment",r"живі|сонні|неактив|dormant|sleeping"]),
 ("core_events",   [r"core[_ ]?event",r"star",r"north"]),
 ("active_users",  [r"active_users",r"\bmau\b",r"monthly_active",r"active_residents"]),
 ("new_users",     [r"new_users",r"first_seen|min\(.*date"]),
 ("events_usage",  [r"event_type",r"events_407641"]),
 ("occupancy",     [r"occupancy",r"apartment",r"space_apartments"]),
 ("citizen_stat",  [r"statistic_citizen"]),
 ("orders",        [r"\borders\b",r"order_tasks",r"tasks_locations"]),
 ("debt",          [r"debt",r"initial_debt",r"debt_balance"]),
 ("payments",      [r"payment",r"master_buh_service_payment",r"paid_amount"]),
]
def slugify(q):
    ql=q.lower()
    for name,pats in KEYWORDS:
        for p in pats:
            if re.search(p,ql): return name
    return "misc"

# choose best (longest inner) query per (report,datasource)
def clean(rows):
    seen={}
    for r in rows:
        rep=REPORTS.get(r.get('report_id'))
        if not rep: continue  # skip None / unmapped
        ds=r.get('datasource_id')
        if not ds: continue
        key=(rep,ds)
        inner=full_unwrap(r.get('longest_query'))
        prev=seen.get(key)
        if prev is None or len(inner)>len(prev['inner']):
            seen[key]={'rep':rep,'ds':ds,'inner':inner,'runs':int(r['runs']),
                       'first':r['first_seen'][:10],'last':r['last_seen'][:10],
                       'refs':r.get('referenced_tables') or []}
    return seen

seen=clean(eu)
from collections import defaultdict
bydash=defaultdict(list)
for v in seen.values(): bydash[v['rep']].append(v)

master=["# Looker Studio — извлечённая логика (custom SQL всех дашбордов)","",
 f"Источник: BigQuery job history (`region-eu.INFORMATION_SCHEMA.JOBS_BY_PROJECT`), метка `requestor=looker_studio`. Извлечено {TODAY}.","",
 "Каждый источник данных Looker Studio = отдельный custom SQL. `passthrough` = обёртка вокруг существующего BQ-view (известная lineage); `custom` = логика, живущая только в Looker.","",
 "| Дашборд | report_id | Источников | passthrough | custom |","|---|---|---|---|---|"]

for rep in sorted(bydash):
    items=sorted(bydash[rep],key=lambda x:-x['runs'])
    d=os.path.join(ROOT,rep); os.makedirs(d,exist_ok=True)
    npass=ncustom=0
    idx=[f"# {rep} — источники Looker Studio","",f"Извлечено {TODAY} из job history. Всего источников: {len(items)}.","",
         "| Файл | Тип | runs | last_seen | Читает |","|---|---|---|---|---|"]
    used=defaultdict(int)
    for it in items:
        tgt=passthrough_target(it['inner'])
        if tgt:
            typ="passthrough"; npass+=1; base=f"passthrough_{tgt.split('.')[-1].strip().replace(' ','_')}"
        else:
            typ="custom"; ncustom+=1; base=f"custom_{slugify(it['inner'])}"
        used[base]+=1
        suffix=f"_{used[base]}" if used[base]>1 else ""
        fname=f"{base}{suffix}__{it['ds'][:8]}.sql"
        refs=", ".join(it['refs']) or "-"
        header=(f"-- Looker Studio custom SQL — {rep}\n"
                f"-- datasource_id: {it['ds']}\n"
                f"-- report_id: {[k for k,v in REPORTS.items() if v==rep][0]}\n"
                f"-- type: {typ}"+(f"  (обёртка вокруг {tgt})" if tgt else "")+"\n"
                f"-- runs(90d): {it['runs']}   first_seen: {it['first']}   last_seen: {it['last']}\n"
                f"-- referenced_tables: {refs}\n"
                f"-- provenance: восстановлено из BigQuery job history {TODAY} (requestor=looker_studio)\n"
                f"-- параметры Looker (@DS_START_DATE/@DS_END_DATE/...) оставлены как в оригинале\n\n")
        open(os.path.join(d,fname),"w",encoding='utf-8').write(header+it['inner']+"\n")
        idx.append(f"| `{fname}` | {typ} | {it['runs']} | {it['last']} | {refs[:80]} |")
    open(os.path.join(d,"_index.md"),"w",encoding='utf-8').write("\n".join(idx)+"\n")
    rid=[k for k,v in REPORTS.items() if v==rep][0]
    master.append(f"| {rep} | `{rid}` | {len(items)} | {npass} | {ncustom} |")
    print(f"{rep:40} sources={len(items):3}  passthrough={npass:3}  custom={ncustom:3}")

open(os.path.join(ROOT,"_index.md"),"w",encoding='utf-8').write("\n".join(master)+"\n")
print("\nWROTE to", ROOT)
