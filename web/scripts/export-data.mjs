/**
 * BigQuery → JSON. Вивантажує продуктові mart'и у web/data/.
 *
 * Автентифікація — та сама ADC, що й у dbt (`gcloud auth application-default login`).
 * Ніяких service account'ів і ключів: скрипт запускається руками, під твоїм акаунтом.
 *
 *   node scripts/export-data.mjs
 *
 * Список нижче — це і є "export manifest": єдине місце, де записано, що саме
 * їде на дашборд. Марти маленькі (всі разом < 5 MB), тому беремо їх цілком,
 * без агрегації і без проміжного srv_-шару.
 */

import { BigQuery } from "@google-cloud/bigquery";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "analytics-454817";
const DATASET = "dbt_product";

/** mart → як сортувати при вивантаженні (щоб JSON був стабільним між запусками) */
const MANIFEST = {
  mart_user_base_totals_monthly: "report_month",
  mart_user_base_monthly: "report_month, complex_name",
  mart_user_segments_monthly: "report_month, complex_name",
  mart_user_segments: "activity_segment, os_type",
  mart_activation_monthly: "report_month",
  mart_time_to_value: "report_month",
  mart_engagement_monthly: "report_month",
  mart_utility_receipts_monthly: "report_month",
  mart_star_monthly: "report_month, star_category",
  mart_module_usage_monthly: "report_month, module_order",
  mart_module_retention: "module_order",
  mart_version_adoption: "report_month, os_type, app_version",
  mart_app_health_weekly: "event_week, os_type, app_version",
  mart_app_errors_monthly: "report_month, error_kind",
  mart_app_error_summary_monthly: "report_month, error_class",
  mart_app_errors_weekly: "event_week, os_type, app_version, error_kind",
  mart_adoption_funnel_monthly: "report_month, complex_name, house_address",
  mart_adoption_house_monthly:
    "provision_month, complex_name, house_address, property_kind",
};

/**
 * Вивантаження в словниковому форматі — той самий прийом, що в
 * export-data-operational.mjs.
 *
 * Обидві adoption-вітрини мають грануляцію по БУДИНКАХ, тому в кожному рядку
 * повторюються адреса, назва ЖК і два UUID. Наївним JSON вони важили 3,0 МБ на
 * 6,3 тис. рядків — при тому, що весь продуктовий каталог до них важив 1,5 МБ.
 * Ці файли перезаписуються ЩОДНЯ автооновленням, тож платить за розмір історія
 * git. Після кодування — близько 0,6 МБ.
 *
 * У браузер це не їде в жодному вигляді: `lib/data.ts` читається на сервері.
 */
const COMPACT = {
  mart_adoption_funnel_monthly: [
    "report_month",
    "report_month_key",
    "house_id",
    "house_address",
    "complex_id",
    "complex_name",
    "house_opened_date",
  ],
  mart_adoption_house_monthly: [
    "provision_month",
    "provision_month_key",
    "house_id",
    "house_address",
    "complex_id",
    "complex_name",
    "property_kind",
    "property_kind_ua",
    "house_opened_date",
  ],
};

/** Масив обʼєктів → {cols, dict, rows}. */
function encodeCompact(rows, dictCols) {
  if (rows.length === 0) return { cols: [], dict: {}, rows: [] };
  const cols = Object.keys(rows[0]);
  const dictSet = new Set(dictCols);
  const dict = {};
  const index = {};
  for (const c of dictCols) {
    dict[c] = [];
    index[c] = new Map();
  }
  const encoded = rows.map((row) =>
    cols.map((c) => {
      if (!dictSet.has(c)) return row[c];
      const v = row[c];
      let i = index[c].get(v);
      if (i === undefined) {
        i = dict[c].length;
        dict[c].push(v);
        index[c].set(v, i);
      }
      return i;
    })
  );
  return { cols, dict, rows: encoded };
}

/**
 * Агрегати, яких немає готовим mart'ом.
 *
 * `mart_version_adoption` має грануляцію місяць × ОС × ВЕРСІЯ. Сумувати
 * `active_users` по версіях НЕ МОЖНА: хто за місяць користувався двома
 * версіями, порахується двічі (перевірено: iOS 6 080 замість 5 153, +18%).
 * Тому розподіл по ОС рахуємо окремим distinct-запитом.
 *
 * ⚠️ Це тимчасово тут. Правильне місце — окремий mart у dbt_product; тоді й
 * дашборд, і будь-який інший споживач отримають однакову цифру.
 */
const QUERIES = {
  agg_os_monthly: `
    select
      format_date('%Y-%m', event_month)   as report_month_key,
      last_os_type                        as os_type,
      count(distinct user_phone_sk)       as users
    from \`${PROJECT}.${DATASET}.fct_user_monthly\`
    where last_os_type is not null
    group by 1, 2
    order by 1, 2
  `,

  /**
   * Аномалії для наративу й анотацій на графіках.
   *
   * Беремо ТІЛЬКИ рядки-аномалії й тільки за останні 13 місяців: уся історія
   * тут не потрібна, а файл має лишатись маленьким. `dashboard_section`
   * приїжджає з seed'а `product_metric_series` — саме за ним наратив
   * розкладається по сторінках.
   */
  insights: `
    select
      report_month_key,
      dashboard_section,
      series_key,
      label_ua,
      metric_id,
      dimension_key,
      dimension_value,
      month_status,
      source_kind,
      value_type,
      value,
      prev_value,
      mom_abs,
      mom_pct,
      robust_z,
      direction,
      direction_good,
      impact,
      severity,
      is_suspected_data_gap,
      verdict
    from \`${PROJECT}.${DATASET}.srv_metric_anomalies\`
    where is_anomaly
      and report_month >= date_sub(date_trunc(current_date(), month), interval 13 month)
    order by report_month_key desc, abs(robust_z) desc nulls last, series_key
  `,
};

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * BigQuery віддає DATE/DATETIME/TIMESTAMP як обгортки {value: "..."}, а INT64
 * може приїхати як BigInt. І те, й інше ламає JSON.stringify — розгортаємо.
 */
function normalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && "value" in value) {
    // DATE/DATETIME → "2026-07-01", обрізаємо час: усі наші марти місячні/тижневі
    return String(value.value).slice(0, 10);
  }
  return value;
}

async function main() {
  const bq = new BigQuery({ projectId: PROJECT });
  await mkdir(OUT_DIR, { recursive: true });

  const meta = {
    snapshot_at: new Date().toISOString(),
    project: PROJECT,
    dataset: DATASET,
    tables: {},
  };

  for (const [table, orderBy] of Object.entries(MANIFEST)) {
    const sql = `SELECT * FROM \`${PROJECT}.${DATASET}.${table}\` ORDER BY ${orderBy}`;
    const [rows] = await bq.query({ query: sql, location: "EU" });

    const clean = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalize(v)]))
    );

    const file = join(OUT_DIR, `${table}.json`);
    const payload = COMPACT[table] ? encodeCompact(clean, COMPACT[table]) : clean;
    await writeFile(file, JSON.stringify(payload, null, 0) + "\n", "utf8");

    meta.tables[table] = {
      rows: clean.length,
      compact: Boolean(COMPACT[table]),
    };
    const tag = COMPACT[table] ? " (словниковий формат)" : "";
    console.log(
      `  ${table.padEnd(34)} ${String(clean.length).padStart(6)} рядків${tag}`
    );
  }

  for (const [name, sql] of Object.entries(QUERIES)) {
    const [rows] = await bq.query({ query: sql, location: "EU" });
    const clean = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalize(v)]))
    );
    await writeFile(
      join(OUT_DIR, `${name}.json`),
      JSON.stringify(clean, null, 0) + "\n",
      "utf8"
    );
    meta.tables[name] = { rows: clean.length };
    console.log(`  ${name.padEnd(34)} ${String(clean.length).padStart(6)} рядків`);
  }

  await writeFile(
    join(OUT_DIR, "_meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8"
  );

  console.log(`\n✓ ${Object.keys(MANIFEST).length} таблиць → web/data/`);
  console.log(`  snapshot_at = ${meta.snapshot_at}`);
}

main().catch((err) => {
  console.error("✗ Експорт впав:", err.message);
  process.exit(1);
});
