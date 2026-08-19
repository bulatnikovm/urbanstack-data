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
   * Динаміка портфеля по місяцях: сходинки конфлікту + настрій будинку.
   *
   * Порахувати це в JS із `agg_houses_monthly` можна, але тоді ряд обірвався
   * б там, де обрізане вікно будинків, — а тренд потрібен довший за чергу
   * роботи.
   *
   * Джерело — `mart_house_segment_mix_monthly` (там уже зведені всі три осі),
   * доджойнений до `mart_house_churn_risk_monthly` заради оцінок: частка
   * 1-2 живе там, у міксі її немає.
   */
  agg_churn_stage_monthly: `
    select
      format_date('%Y-%m', m.report_month)           as report_month_key,
      count(*)                                       as houses_total,
      countif(m.needs_attention)                     as houses_attention,
      countif(m.risk_stage >= 3)                     as houses_stage3plus,
      countif(m.risk_stage = 5)                      as houses_left,
      countif(m.risk_stage = 4)                      as houses_intent,
      countif(m.risk_stage = 3)                      as houses_organizing,
      countif(m.risk_stage = 2)                      as houses_legalizing,
      countif(m.risk_stage = 1)                      as houses_irritated,
      countif(m.is_fading)                           as houses_fading,
      countif(m.is_fading and m.risk_stage < 2)      as houses_fading_only,
      countif(m.house_mood = 'Ризиковий')            as houses_risky,
      countif(m.house_mood = 'Напружений')           as houses_tense,
      countif(m.house_mood = 'Шумний')               as houses_noisy,
      countif(m.house_mood = 'мало даних')           as houses_thin,
      sum(m.n_active_residents)                      as residents_active,
      sum(m.n_restless_plus)                         as residents_restless_plus,
      sum(m.n_revolutionary)                         as residents_revolutionary,
      sum(c.campaigns_esc_3m)                        as campaigns_esc_3m,
      safe_divide(sum(c.reviews_low_3m), nullif(sum(c.reviews_3m), 0)) as low_rating_share
    from \`${PROJECT}.${DATASET}.mart_house_segment_mix_monthly\` m
    join \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\` c
      using (house_id, report_month)
    group by 1
    order by 1
  `,

  /**
   * Будинки по місяцях — усі три осі в одному рядку, 12 місяців.
   *
   * ⚠️ Раніше тут були ЛИШЕ будинки, що бодай раз потрапляли в зону уваги
   * (791 рядок). Тепер їдуть усі: сторінка «Напруга і сегменти» показує
   * склад населення й по спокійних будинках теж — інакше немає з чим
   * порівнювати, а перцентиль без хвоста розподілу читається як абсолют.
   * Ціна: ~1 300 рядків замість 791, тобто +0,2 MB на добовий коміт.
   *
   * 12 місяців, а не вся історія (5 156 рядків × 30 колонок ≈ 1 MB на
   * КОЖЕН добовий коміт) — довгий тренд дає `agg_churn_stage_monthly`,
   * який на два порядки менший.
   */
  agg_houses_monthly: `
    select
      format_date('%Y-%m', m.report_month)  as report_month_key,
      m.complex_name,
      m.house_number,
      m.n_apartments,

      m.risk_stage,
      m.risk_stage_ua,
      m.risk_stage_max_6m,
      m.is_fading,
      m.needs_attention,
      m.house_mood,

      m.n_active_residents,
      m.n_restless_plus,
      m.n_overthinker_plus,
      m.n_revolutionary,
      m.n_ever_revolutionary,
      m.n_campaign_members,
      m.share_restless_plus,
      m.share_pctile,
      m.contagion_3m,

      c.campaigns_esc_3m,
      c.campaign_people_esc_3m,
      c.legal_3m,
      c.escalation_p100_3m,
      c.osbb_intent_12m,
      c.reviews_3m,
      c.low_rating_share_3m,
      c.engagement_drop,
      c.orders_recent_per_month,
      c.orders_base_per_month
    from \`${PROJECT}.${DATASET}.mart_house_segment_mix_monthly\` m
    join \`${PROJECT}.${DATASET}.mart_house_churn_risk_monthly\` c
      using (house_id, report_month)
    where m.report_month >= date_sub(
      (select max(report_month) from \`${PROJECT}.${DATASET}.mart_house_segment_mix_monthly\`),
      interval 11 month)
    order by m.report_month, m.complex_name, m.house_number
  `,

  /**
   * Популяція мешканців по сегментах напруги — рівень ЛЮДИНИ, зведений до
   * лічильників.
   *
   * ⚠️ Персональних рядків тут немає і не буде: сегмент людини — це
   * профілювання за персональними даними, воно йде керівнику комунікацій
   * (контур C), а не на спільний дашборд. На сторінку — тільки агрегати.
   */
  agg_segment_monthly: `
    select
      format_date('%Y-%m', report_month)             as report_month_key,
      countif(orders_12m > 0)                        as residents_active,
      countif(segment_no = 1 and orders_12m > 0)     as calm,
      countif(segment_no = 2)                        as restless,
      countif(segment_no = 3)                        as overthinkers,
      countif(segment_no = 4)                        as revolutionaries,
      countif(segment_no >= 2)                       as tense_total,
      countif(behaviour_segment = 'Організатор')     as organizers,
      countif(behaviour_segment = 'Хронічний')       as chronic,
      countif(behaviour_segment = 'Розчарований')    as disappointed,
      countif(is_silent)                             as silent,
      countif(peak_segment_no = 4)                   as ever_revolutionary,
      countif(ever_osbb_intent)                      as ever_osbb,
      countif(campaigns_esc_6m >= 1)                 as campaign_members
    from \`${PROJECT}.${DATASET}.fct_resident_friction_monthly\`
    group by 1
    order by 1
  `,

  /**
   * Той самий склад, але в розрізі ЖК: 12 ЖК × 32 місяці = 384 рядки,
   * тому їде повністю.
   */
  agg_segment_complex_monthly: `
    select
      format_date('%Y-%m', f.report_month)           as report_month_key,
      f.main_complex_id                              as complex_id,
      any_value(d.complex_name)                      as complex_name,
      countif(f.orders_12m > 0)                      as residents_active,
      countif(f.segment_no >= 2)                     as tense_total,
      countif(f.segment_no = 3)                      as overthinkers,
      countif(f.segment_no = 4)                      as revolutionaries,
      countif(f.behaviour_segment = 'Організатор')   as organizers,
      countif(f.is_silent)                           as silent
    from \`${PROJECT}.${DATASET}.fct_resident_friction_monthly\` f
    join \`${PROJECT}.${DATASET}.dim_complex\` d
      on d.complex_id = f.main_complex_id
    where f.main_complex_id is not null
    group by 1, 2
    order by 1, 2
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
