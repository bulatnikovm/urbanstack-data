/**
 * BigQuery → JSON. Вивантажує операційні mart'и у web-operational/data/.
 *
 * Автентифікація — та сама ADC, що й у dbt (`gcloud auth application-default login`).
 *
 *   node scripts/export-data.mjs
 *
 * Список нижче — це і є "export manifest": єдине місце, де записано, що саме
 * їде на операційний дашборд.
 */

import { BigQuery } from "@google-cloud/bigquery";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "analytics-454817";
const DATASET = "dbt_operational";

/** mart → як сортувати при вивантаженні (щоб JSON був стабільним між запусками) */
const MANIFEST = {
  mart_campaigns: "started_at desc",
};

/**
 * Агрегати, яких немає готовим mart'ом, або марти, які треба обрізати перед
 * вивантаженням.
 *
 * ⚠️ Правильне місце для перших — окремий mart у dbt_operational; тоді й
 * дашборд, і будь-який інший споживач отримають однакову цифру.
 */
const QUERIES = {
  /**
   * Компанія по місяцях × ЖК: будинки, приміщення, користувачі. Джерело —
   * `mart_monthly_complex_overview`, лише 816 рядків (12 ЖК × 68 місяців),
   * тому вивантажуємо повністю без обрізання, на відміну від churn-мартів.
   *
   * `format_date` тут, а не в самій dbt-моделі: модель віддає `report_month`
   * як DATE (як і решта operational-шару), а `report_month_key` у форматі
   * "YYYY-MM" потрібен лише споживачам JSON — так само, як і в
   * `agg_churn_stage_monthly`.
   *
   * Обрізано до полів, які реально малюються: `mart_monthly_complex_overview`
   * ще має src-колонки для звірки зі снапшотом (`n_users_total_src` тощо) і
   * SLA-лічильники — вони тут не потрібні, для заявок буде окрема сторінка.
   */
  agg_complex_overview_monthly: `
    select
      format_date('%Y-%m', report_month)  as report_month_key,
      complex_id,
      complex_name,
      n_houses_active,
      n_apartments,
      n_parking,
      n_commercial,
      n_users_total,
      n_users_confirmed,
      n_users_unconfirmed,
      n_owners,
      n_tenants,
      n_billing_accounts
    from \`${PROJECT}.${DATASET}.mart_monthly_complex_overview\`
    order by report_month, complex_name
  `,

  /**
   * Динаміка популяції по стадіях ризику.
   *
   * Порахувати це в JS із `agg_churn_houses` можна, але тоді ряд обірвався б
   * там, де обрізане вікно будинків, — а тренд потрібен довший за чергу роботи.
   */
  agg_churn_stage_monthly: `
    select
      format_date('%Y-%m', report_month)             as report_month_key,
      count(*)                                       as houses_total,
      countif(needs_attention)                       as houses_attention,
      countif(risk_stage >= 3)                       as houses_stage3plus,
      countif(risk_stage = 5)                        as houses_left,
      countif(risk_stage = 4)                        as houses_intent,
      countif(risk_stage = 3)                        as houses_organizing,
      countif(risk_stage = 2)                        as houses_legalizing,
      countif(risk_stage = 1)                        as houses_irritated,
      countif(is_fading)                             as houses_fading,
      countif(is_fading and risk_stage < 2)          as houses_fading_only,
      sum(campaigns_esc_3m)                          as campaigns_esc_3m,
      safe_divide(sum(reviews_low_3m), nullif(sum(reviews_3m), 0)) as low_rating_share
    from \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\`
    group by 1
    order by 1
  `,

  /**
   * Будинки по місяцях — черга роботи + історія прапорців.
   *
   * Три обрізання, усі навмисні: 12 місяців, лише потрібні колонки і ЛИШЕ
   * будинки, що бодай раз потрапляли в зону уваги. Повна марта — 5 156 рядків
   * × 30 колонок ≈ 1 MB, і вона комітилась би ЩОДОБИ разом із рештою зрізу
   * (оновлення даних = коміт = пересборка), тобто сотні мегабайт історії на
   * рік заради даних, які сторінка не показує.
   *
   * Що втрачаємо: історію будинків, які весь рік були в нормі. Її й не
   * показуємо — на сторінці «що робити зараз», а довгий тренд по портфелю
   * дає `agg_churn_stage_monthly`, який на два порядки менший.
   */
  agg_churn_houses: `
    with flagged as (
      select distinct house_id
      from \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\`
      where needs_attention
        and report_month >= date_sub(
          (select max(report_month) from \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\`),
          interval 11 month)
    )
    select
      format_date('%Y-%m', report_month)  as report_month_key,
      complex_name,
      house_number,
      n_apartments,
      risk_stage,
      risk_stage_ua,
      is_fading,
      needs_attention,
      campaigns_esc_3m,
      campaign_people_esc_3m,
      legal_3m,
      escalation_p100_3m,
      osbb_intent_12m,
      reviews_3m,
      low_rating_share_3m,
      engagement_drop,
      orders_recent_per_month,
      orders_base_per_month
    from \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\`
    where house_id in (select house_id from flagged)
      and report_month >= date_sub(
        (select max(report_month) from \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\`),
        interval 11 month)
    order by report_month, complex_name, house_number
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

  const run = async (name, sql) => {
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
  };

  for (const [table, orderBy] of Object.entries(MANIFEST)) {
    await run(
      table,
      `SELECT * FROM \`${PROJECT}.${DATASET}.${table}\` ORDER BY ${orderBy}`
    );
  }
  for (const [name, sql] of Object.entries(QUERIES)) {
    await run(name, sql);
  }

  await writeFile(
    join(OUT_DIR, "_meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8"
  );

  const total = Object.keys(MANIFEST).length + Object.keys(QUERIES).length;
  console.log(`\n✓ ${total} таблиць → web-operational/data/`);
  console.log(`  snapshot_at = ${meta.snapshot_at}`);
}

main().catch((err) => {
  console.error("✗ Експорт впав:", err.message);
  process.exit(1);
});
