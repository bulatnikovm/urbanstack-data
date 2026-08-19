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

  /**
   * SLA по місяцях у розрізі ЖК. 12 ЖК × 68 місяців = 816 рядків, тому
   * без обрізання: сторінка SLA показує весь ряд від запуску CRM, і
   * незакритий залишок (наростаюча сума) без початку ряду не має сенсу.
   *
   * Компанійський тотал рахується в застосунку сумуванням по ЖК — окремого
   * ряду не заводимо, щоб не мати двох джерел однієї цифри.
   */
  agg_sla_monthly: `
    select
      format_date('%Y-%m', s.report_month) as report_month_key,
      s.complex_id,
      d.complex_name,
      s.created_count,
      s.completed_count,
      s.canceled_count,
      s.completed_same_month_count,
      s.backlog_end_of_month
    from \`${PROJECT}.${DATASET}.mart_monthly_sla\` s
    join \`${PROJECT}.${DATASET}.dim_complex\` d on d.complex_id = s.complex_id
    order by s.report_month, d.complex_name
  `,

  /** Заявки по роках × ЖК. 12 ЖК × 6 років — десятки рядків. */
  agg_sla_yearly: `
    select
      y.report_year,
      y.complex_id,
      d.complex_name,
      y.created_count,
      y.completed_count,
      y.canceled_count,
      y.in_progress_count
    from \`${PROJECT}.${DATASET}.mart_yearly_totals\` y
    join \`${PROJECT}.${DATASET}.dim_complex\` d on d.complex_id = y.complex_id
    order by y.report_year, d.complex_name
  `,

  /**
   * Статуси заявок за весь час. mart_status_donut має грануляцію
   * ЖК × місяць × статус (кілька тисяч рядків) — тут згортаємо до
   * ЖК × статус, бо на дашборді це пончик "з моменту заснування".
   */
  agg_status_totals: `
    select
      complex_id,
      status,
      sum(order_count) as order_count
    from \`${PROJECT}.${DATASET}.mart_status_donut\`
    group by 1, 2
    order by 1, 2
  `,

  /**
   * Звернення в розрізі категорії й типу. Вікно 24 місяці: повний ряд з
   * 2021 дає ~35 тис. рядків, а на сторінці показується поточний місяць і
   * динаміка за два роки — довший хвіст нікуди не малюється.
   */
  agg_categories_monthly: `
    select
      format_date('%Y-%m', c.report_month) as report_month_key,
      c.complex_id,
      d.complex_name,
      c.category_ua,
      c.type_ua,
      c.created_count,
      c.valid_created_count,
      c.completed_count,
      c.canceled_count
    from \`${PROJECT}.${DATASET}.mart_monthly_categories\` c
    join \`${PROJECT}.${DATASET}.dim_complex\` d on d.complex_id = c.complex_id
    where c.report_month >= date_sub(date_trunc(current_date(), month), interval 23 month)
    order by c.report_month, d.complex_name, c.category_ua, c.type_ua
  `,

  /** Навантаження/скарги/черга/задачі по ЖК і місяцях — 816 рядків. */
  agg_load_monthly: `
    select
      format_date('%Y-%m', l.report_month) as report_month_key,
      l.complex_id,
      d.complex_name,
      l.n_spaces,
      l.total_orders,
      l.problem_count,
      l.complaint_count,
      l.offer_count,
      l.question_count,
      l.service_count,
      l.other_type_count,
      l.problem_complaint_count,
      l.backlog_30d,
      l.tasks_from_orders,
      l.problem_complaint_tasks,
      l.employee_task_count,
      l.total_tasks,
      l.load_rate,
      l.complaint_load,
      l.complaint_rate,
      l.task_ratio
    from \`${PROJECT}.${DATASET}.mart_complex_load_monthly\` l
    join \`${PROJECT}.${DATASET}.dim_complex\` d on d.complex_id = l.complex_id
    order by l.report_month, d.complex_name
  `,

  /**
   * CSAT: інтегральна оцінка ЖК. 10 рядків — їде як є.
   */
  agg_csat_complex: `
    select
      complex_id, complex_name,
      avg_adjacent, avg_building, avg_security,
      wave_adjacent, wave_building, wave_security,
      integral_uk, integral_total, rating_uk,
      votes_latest, comments_latest, low_grades_latest,
      votes_all_time, comments_all_time, avg_grade_all_time, low_grades_all_time,
      n_billing_accounts, n_users_confirmed, n_apartments,
      reach_of_accounts, reach_of_confirmed, reach_of_apartments
    from \`${PROJECT}.${DATASET}.mart_survey_complex_integral\`
    order by rating_uk
  `,

  /**
   * CSAT: матриця «ЖК × хвиля × будинок». 583 рядки.
   *
   * ⚠️ Віддаємо grade_sum і votes, а НЕ готову середню: середню треба
   * рахувати як SUM(grade_sum)/SUM(votes) на потрібному рівні. Усереднення
   * готових середніх по будинках дає ЖК неправильний бал — будинок із двома
   * голосами важить як будинок із двомастами.
   */
  agg_csat_waves: `
    select
      wave_label, survey_category_ua,
      format_date('%Y-%m', wave_month) as wave_month_key,
      complex_id, complex_name, house_id, house_number, house_address,
      votes, comments, grade_sum, n_apartments,
      grade_5, grade_4, grade_3, grade_2, grade_1
    from \`${PROJECT}.${DATASET}.mart_survey_wave_summary\`
    order by wave_month, complex_name, house_number
  `,

  /**
   * CSAT: стрічка коментарів, 1 516 рядків. Масиви тем розгортаємо в рядок
   * через кому — на сторінці це мітки, а JSON з вкладеними масивами тут
   * нічого не додає.
   */
  agg_csat_comments: `
    select
      answer_id, wave_label, survey_category_ua,
      format_date('%Y-%m', wave_month) as wave_month_key,
      complex_id, complex_name, house_number, house_address,
      grade, is_detractor, is_negative,
      comment,
      format_date('%Y-%m-%d', date(answered_at)) as answered_on,
      array_to_string(themes, '|')     as themes,
      array_to_string(categories, '|') as categories
    from \`${PROJECT}.${DATASET}.mart_survey_comments\`
    order by answered_at desc, answer_id
  `,

  /**
   * CSAT: скільки негативних коментарів згадує кожну тему, по ЖК.
   *
   * Два рівні окремими рядками (`level`), а не один: категорію НЕ можна
   * отримати сумуванням її тем. Коментар «брудно в холі й газон не косять»
   * дає +1 «Прибиранню» і +1 «Території», але в категорії «Чистота та
   * благоустрій» він один. Перша версія сумувала теми й показувала 650
   * замість 495.
   *
   * Усередині одного рівня сумувати по ЖК теж не можна (той самий коментар
   * належить одному ЖК, тому тут якраз можна) — а от складати теми між
   * собою заради «разом» не можна ніде.
   */
  agg_csat_problems: `
    select
      'theme' as level,
      problem_category_ua, problem_theme_ua,
      complex_id, complex_name,
      count(distinct answer_id) as comments
    from \`${PROJECT}.${DATASET}.int_survey_comment_flags\`
    group by 1, 2, 3, 4, 5
    union all
    select
      'category' as level,
      problem_category_ua, problem_category_ua as problem_theme_ua,
      complex_id, complex_name,
      count(distinct answer_id) as comments
    from \`${PROJECT}.${DATASET}.int_survey_comment_flags\`
    group by 1, 2, 3, 4, 5
    order by level, problem_category_ua, comments desc
  `,

  /**
   * Шукач аномалій і антирейтинг будинків. Вікно 12 місяців — ~16 тис.
   * рядків; повна історія дала б 51 тис., а порівнювати місяць треба з
   * тим самим місяцем торік, глибше нікуди.
   *
   * property_kind_ua лишається в грануляції: без нього не побудувати
   * "Відхилені заявки по типу об'єкта".
   */
  agg_orders_house_monthly: `
    select
      format_date('%Y-%m', report_month) as report_month_key,
      complex_id,
      complex_name,
      house_id,
      house_number,
      property_kind_ua,
      category_ua,
      type_ua,
      created_count,
      valid_count,
      completed_count,
      canceled_count,
      n_apartments
    from \`${PROJECT}.${DATASET}.mart_orders_house_monthly\`
    where report_month >= date_sub(date_trunc(current_date(), month), interval 11 month)
    order by report_month, complex_name, house_number, category_ua, type_ua
  `,
};

/**
 * Вивантаження, які пишуться СЛОВНИКОВИМ форматом замість масиву обʼєктів.
 * Значення перелічених колонок замінюються на індекс у словнику, рядок стає
 * масивом чисел. Читає це `loadCompact()` у lib/data.ts і повертає такі самі
 * обʼєкти, тому сторінки різниці не бачать.
 *
 * Навіщо. Ці файли комітяться в репозиторій КОЖНОГО дня (автооновлення), і
 * платить за розмір історія git, а не браузер — дані читаються на сервері.
 * Наївний JSON давав 6,1 МБ на `agg_orders_house_monthly`, з яких більша
 * частина — назви полів і однакові рядки ("Прибудинкова територія", UUID
 * будинку), повторені 15 801 раз. Після кодування — близько 0,5 МБ.
 *
 * Кодуємо тільки два найбільші вивантаження: на файлах у сотні кілобайт
 * виграш не вартий зайвого шару.
 */
const COMPACT = {
  agg_orders_house_monthly: [
    "report_month_key",
    "complex_id",
    "complex_name",
    "house_id",
    "house_number",
    "property_kind_ua",
    "category_ua",
    "type_ua",
  ],
  agg_categories_monthly: [
    "report_month_key",
    "complex_id",
    "complex_name",
    "category_ua",
    "type_ua",
  ],
  // Коментарі: сам ТЕКСТ у словник не йде (він унікальний), а от усе
  // навколо нього — хвиля, ЖК, адреса, набір тем — повторюється на кожному
  // з 1,5 тис. рядків і разом з іменами полів дає більшу частину файлу.
  agg_csat_comments: [
    "wave_label",
    "survey_category_ua",
    "wave_month_key",
    "complex_id",
    "complex_name",
    "house_number",
    "house_address",
    "answered_on",
    "themes",
    "categories",
  ],
  agg_csat_waves: [
    "wave_label",
    "survey_category_ua",
    "wave_month_key",
    "complex_id",
    "complex_name",
    "house_id",
    "house_number",
    "house_address",
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
    const payload = COMPACT[name] ? encodeCompact(clean, COMPACT[name]) : clean;
    await writeFile(
      join(OUT_DIR, `${name}.json`),
      JSON.stringify(payload, null, 0) + "\n",
      "utf8"
    );
    meta.tables[name] = { rows: clean.length, compact: Boolean(COMPACT[name]) };
    const tag = COMPACT[name] ? " (словниковий формат)" : "";
    console.log(
      `  ${name.padEnd(34)} ${String(clean.length).padStart(6)} рядків${tag}`
    );
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
