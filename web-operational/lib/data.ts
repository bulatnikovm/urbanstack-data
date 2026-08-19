/**
 * Читання вивантажених mart'ів операційного домену. Викликається ТІЛЬКИ з
 * серверних компонентів — сирі JSON не потрапляють у клієнтський бандл.
 *
 * Дзеркало `web/lib/data.ts` продуктового дашборду, але з власним набором
 * типів: спільних мартів у двох застосунків немає, спільним лишається лише
 * підхід (типізований `load`, реєстр метрик за підписом картки, період в URL).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveRange, type Range } from "./period";

const DATA_DIR = join(process.cwd(), "data");

function load<T>(name: string): T[] {
  return JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), "utf8"));
}

type Compact = {
  cols: string[];
  dict: Record<string, string[]>;
  rows: (number | null)[][];
};

/**
 * Читання вивантажень у словниковому форматі (див. COMPACT у
 * scripts/export-data.mjs). Повертає такі самі обʼєкти, що й `load`, тому
 * сторінки різниці не бачать — стиснення живе тільки на межі файлу.
 *
 * Формат зʼявився через розмір: `agg_orders_house_monthly` наївним JSON
 * важив 6,1 МБ на 15,8 тис. рядків, і цей файл перезаписується щодня
 * автооновленням. Платить за це історія git, а не браузер: дані читаються
 * на сервері й у клієнтський бандл не потрапляють.
 */
function loadCompact<T>(name: string): T[] {
  const doc = JSON.parse(
    readFileSync(join(DATA_DIR, `${name}.json`), "utf8")
  ) as Compact;
  return doc.rows.map((row) => {
    const out: Record<string, unknown> = {};
    doc.cols.forEach((col, i) => {
      const d = doc.dict[col];
      out[col] = d ? d[row[i] as number] : row[i];
    });
    return out as T;
  });
}

// ── Типи mart'ів (дзеркалять схему dbt_operational) ─────────────────────

export type ComplexOverview = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  n_houses_active: number;
  n_apartments: number;
  n_parking: number;
  n_commercial: number;
  n_users_total: number;
  n_users_confirmed: number;
  n_users_unconfirmed: number;
  n_owners: number;
  n_tenants: number;
  n_billing_accounts: number;
};

export type ChurnStageMonthly = {
  report_month_key: string;
  houses_total: number;
  houses_attention: number;
  houses_stage3plus: number;
  houses_left: number;
  houses_intent: number;
  houses_organizing: number;
  houses_legalizing: number;
  houses_irritated: number;
  houses_fading: number;
  houses_fading_only: number;
  houses_risky: number;
  houses_tense: number;
  houses_noisy: number;
  houses_thin: number;
  residents_active: number;
  residents_restless_plus: number;
  residents_revolutionary: number;
  campaigns_esc_3m: number;
  low_rating_share: number | null;
};

/**
 * Будинок × місяць — усі ТРИ осі ризику в одному рядку.
 *
 * Осі не складаються в одне число і це не спрощення, яке колись приберуть:
 * сходинка каже «що відбувається», настрій — «хто живе», згасання — «чи з
 * нами ще розмовляють». Будинок буває тихим і вже втраченим (Севен) або
 * гучним і стабільним («Грейт»).
 */
export type HouseMonthly = {
  report_month_key: string;
  complex_name: string;
  house_number: string;
  n_apartments: number;

  risk_stage: number;
  risk_stage_ua: string;
  /** Гістерезис: максимум сходинки за півроку — див. коментар у dbt-моделі. */
  risk_stage_max_6m: number;
  is_fading: boolean;
  needs_attention: boolean;
  house_mood: string;

  n_active_residents: number;
  n_restless_plus: number;
  n_overthinker_plus: number;
  n_revolutionary: number;
  n_ever_revolutionary: number;
  n_campaign_members: number;
  share_restless_plus: number | null;
  share_pctile: number | null;
  contagion_3m: number | null;

  campaigns_esc_3m: number;
  campaign_people_esc_3m: number;
  legal_3m: number;
  escalation_p100_3m: number | null;
  osbb_intent_12m: number;
  reviews_3m: number;
  low_rating_share_3m: number | null;
  engagement_drop: number | null;
  orders_recent_per_month: number | null;
  orders_base_per_month: number | null;
};

/** Популяція мешканців по сегментах напруги. Тільки лічильники — персональні
 * рядки на спільний дашборд не їдуть (профілювання за перс. даними). */
export type SegmentMonthly = {
  report_month_key: string;
  residents_active: number;
  calm: number;
  restless: number;
  overthinkers: number;
  revolutionaries: number;
  tense_total: number;
  organizers: number;
  chronic: number;
  disappointed: number;
  silent: number;
  ever_revolutionary: number;
  ever_osbb: number;
  campaign_members: number;
};

export type SegmentComplexMonthly = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  residents_active: number;
  tense_total: number;
  overthinkers: number;
  revolutionaries: number;
  organizers: number;
  silent: number;
};

export type Campaign = {
  campaign_id: string;
  complex_id: string;
  complex_name: string;
  started_at: string;
  ended_at: string;
  days_since_last: number;
  report_month: string;
  n_orders: number;
  n_people: number;
  n_houses: number;
  houses: string;
  category_ua: string | null;
  has_legal: boolean;
  has_collective: boolean;
  has_osbb_intent: boolean;
  n_escalation_orders: number;
  text_prefix45: string;
  sample_text: string;
};

/** SLA по ЖК і місяцях. Основа сторінки «Операційна ефективність». */
export type SlaMonthly = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  created_count: number;
  completed_count: number;
  canceled_count: number;
  completed_same_month_count: number;
  /** Наростаючий незакритий залишок на кінець місяця. */
  backlog_end_of_month: number;
};

export type SlaYearly = {
  report_year: number;
  complex_id: string;
  complex_name: string;
  created_count: number;
  completed_count: number;
  canceled_count: number;
  in_progress_count: number;
};

export type StatusTotal = {
  complex_id: string;
  status: string;
  order_count: number;
};

/** Звернення в розрізі категорії й типу, вікно 24 місяці. */
export type CategoryMonthly = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  category_ua: string;
  type_ua: string;
  /** Усі подані за місяць, разом зі скасованими згодом. */
  created_count: number;
  /** Подані й не скасовані — те, що реально стало роботою. */
  valid_created_count: number;
  completed_count: number;
  canceled_count: number;
};

/** Навантаження, скарги, черга 30+, внутрішні задачі — по ЖК і місяцях. */
export type LoadMonthly = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  n_spaces: number;
  total_orders: number;
  problem_count: number;
  complaint_count: number;
  offer_count: number;
  question_count: number;
  service_count: number;
  other_type_count: number;
  problem_complaint_count: number;
  backlog_30d: number;
  tasks_from_orders: number;
  /** Чисельник «задач на проблему» — без нього показник не переагрегувати. */
  problem_complaint_tasks: number;
  employee_task_count: number;
  total_tasks: number;
  load_rate: number | null;
  complaint_load: number | null;
  complaint_rate: number | null;
  task_ratio: number | null;
};

/** Найдетальніший зріз: будинок × тип обʼєкта × категорія × тип, 12 місяців. */
export type OrdersHouseMonthly = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  house_id: string;
  house_number: string;
  property_kind_ua: string;
  category_ua: string;
  type_ua: string;
  /** Усі подані, разом зі скасованими згодом. */
  created_count: number;
  /** Подані й не скасовані. */
  valid_count: number;
  completed_count: number;
  canceled_count: number;
  n_apartments: number;
};

/** Інтегральна оцінка ЖК за останньою хвилею кожної категорії. */
export type CsatComplex = {
  complex_id: string;
  complex_name: string;
  avg_adjacent: number | null;
  avg_building: number | null;
  avg_security: number | null;
  wave_adjacent: string | null;
  wave_building: string | null;
  wave_security: string | null;
  /** Прибудинкова + Будинкова. NULL = немає однієї зі складових, не нуль. */
  integral_uk: number | null;
  /** Інтегральний УК + Охорона. */
  integral_total: number | null;
  rating_uk: number;
  votes_latest: number;
  comments_latest: number;
  low_grades_latest: number;
  votes_all_time: number;
  comments_all_time: number;
  avg_grade_all_time: number | null;
  low_grades_all_time: number;
  n_billing_accounts: number | null;
  n_users_confirmed: number | null;
  reach_of_accounts: number | null;
  reach_of_confirmed: number | null;
};

/**
 * Хвиля × ЖК × будинок.
 *
 * ⚠️ `grade_sum` замість готової середньої — навмисно. Середню рахувати як
 * SUM(grade_sum)/SUM(votes) на потрібному рівні; усереднення готових
 * середніх по будинках дає ЖК неправильний бал (будинок із двома голосами
 * важить як будинок із двомастами).
 */
export type CsatWave = {
  wave_label: string;
  survey_category_ua: string;
  wave_month_key: string;
  complex_id: string;
  complex_name: string;
  house_id: string | null;
  house_number: string;
  house_address: string;
  votes: number;
  comments: number;
  grade_sum: number;
  grade_5: number;
  grade_4: number;
  grade_3: number;
  grade_2: number;
  grade_1: number;
};

/** Коментар мешканця. Персональних ідентифікаторів немає — найдрібніший розріз будинок. */
export type CsatComment = {
  answer_id: number;
  wave_label: string;
  survey_category_ua: string;
  wave_month_key: string;
  complex_id: string;
  complex_name: string;
  house_number: string;
  house_address: string;
  grade: number;
  is_detractor: boolean;
  is_negative: boolean;
  comment: string;
  answered_on: string;
  /** Теми через "|" — порожній рядок, якщо словник нічого не впізнав. */
  themes: string;
  categories: string;
};

export type CsatProblem = {
  /**
   * "category" або "theme". Рівні лежать окремими рядками, бо категорію
   * НЕ можна отримати сумуванням її тем: коментар, що згадує і прибирання,
   * і територію, дає +1 кожній темі, але в категорії він один.
   */
  level: "category" | "theme";
  problem_category_ua: string;
  problem_theme_ua: string;
  complex_id: string;
  complex_name: string;
  comments: number;
};

export type Meta = {
  snapshot_at: string;
  dataset: string;
  tables: Record<string, { rows: number }>;
};

// ── Доступ ──────────────────────────────────────────────────────────────

export const getMeta = (): Meta =>
  JSON.parse(readFileSync(join(DATA_DIR, "_meta.json"), "utf8"));

export const getComplexOverview = () =>
  load<ComplexOverview>("agg_complex_overview_monthly");

/** Ключ поточного (можливо, ще незавершеного) місяця — "2026-08". */
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export type CompanyMonthly = {
  report_month_key: string;
  n_houses_active: number;
  n_apartments: number;
  n_parking: number;
  n_commercial: number;
  n_users_total: number;
  n_users_confirmed: number;
};

/**
 * Компанія загалом по місяцях — сума по всіх ЖК.
 *
 * Рахуємо в TS, а не окремим SQL-агрегатом: `agg_complex_overview_monthly`
 * має грануляцію complex_id × report_month БЕЗ fan-out, тож SUM по місяцю —
 * звичайний GROUP BY, а не ризик подвійного рахунку (як було з
 * `mart_version_adoption` у продуктовому дашборді, де сума по версіях
 * рахувала юзера, що змінив версію всередині місяця, двічі).
 */
export function companyMonthly(rows: ComplexOverview[]): CompanyMonthly[] {
  const byMonth = new Map<string, CompanyMonthly>();
  for (const r of rows) {
    const acc = byMonth.get(r.report_month_key) ?? {
      report_month_key: r.report_month_key,
      n_houses_active: 0,
      n_apartments: 0,
      n_parking: 0,
      n_commercial: 0,
      n_users_total: 0,
      n_users_confirmed: 0,
    };
    acc.n_houses_active += r.n_houses_active;
    acc.n_apartments += r.n_apartments;
    acc.n_parking += r.n_parking;
    acc.n_commercial += r.n_commercial;
    acc.n_users_total += r.n_users_total;
    acc.n_users_confirmed += r.n_users_confirmed;
    byMonth.set(r.report_month_key, acc);
  }
  return [...byMonth.values()].sort((a, b) =>
    a.report_month_key.localeCompare(b.report_month_key)
  );
}

/**
 * Період сторінки «Огляд ЖК».
 *
 * На відміну від `getChurnPeriod()`, тут ПОКАЗУЄМО поточний незавершений
 * місяць (з позначкою `isPartial`) — так само, як у продуктовому дашборді.
 * Причина відмінності: `mart_house_churn_risk_monthly` рахує тримісячні
 * ковзні вікна, які на неповному місяці штучно просідають; тут же кожен
 * місяць — самостійний знімок (будинки/квартири/користувачі станом на
 * дату), і неповний місяць просто означає «дані станом на сьогодні», без
 * спотворення.
 */
export function getOverviewPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const raw = getComplexOverview();
  const all = companyMonthly(raw);
  const bounds = {
    min: all[0].report_month_key,
    max: all.at(-1)!.report_month_key,
  };
  const r: Range = params
    ? resolveRange(params, bounds)
    : { from: bounds.min, to: bounds.max };

  const base = all.filter(
    (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
  );
  const cur = base.at(-1) ?? all.at(-1)!;
  const curIdx = all.findIndex(
    (x) => x.report_month_key === cur.report_month_key
  );
  const prev = all[Math.max(0, curIdx - 1)];

  return {
    all,
    base,
    bounds,
    range: r,
    cur,
    prev,
    curKey: cur.report_month_key,
    prevKey: prev.report_month_key,
    isPartial: cur.report_month_key === currentMonthKey(),
    daysElapsed: new Date().getDate(),
    daysInMonth: new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate(),
    inWindow: <T extends { report_month_key: string }>(rows: T[]) =>
      rows.filter(
        (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
      ),
    /** Рядки по ЖК за конкретний місяць, без порожніх (ще) записів на кшталт БЦ без жодного будинку. */
    byComplex: (monthKey: string) =>
      raw.filter(
        (x) =>
          x.report_month_key === monthKey &&
          (x.n_houses_active > 0 || x.n_apartments > 0 || x.n_users_total > 0)
      ),
  };
}

// ── Заявки і сервіс ─────────────────────────────────────────────────────

export const getSla = () => load<SlaMonthly>("agg_sla_monthly");
export const getSlaYearly = () => load<SlaYearly>("agg_sla_yearly");
export const getStatusTotals = () => load<StatusTotal>("agg_status_totals");
export const getLoad = () => load<LoadMonthly>("agg_load_monthly");
export const getCategories = () =>
  loadCompact<CategoryMonthly>("agg_categories_monthly");
export const getOrdersHouse = () =>
  loadCompact<OrdersHouseMonthly>("agg_orders_house_monthly");

export type CompanySla = {
  report_month_key: string;
  created_count: number;
  completed_count: number;
  canceled_count: number;
  completed_same_month_count: number;
  backlog_end_of_month: number;
};

/** Компанія загалом: сума по ЖК. Грануляція ЖК × місяць без fan-out. */
export function companySla(rows: SlaMonthly[]): CompanySla[] {
  const byMonth = new Map<string, CompanySla>();
  for (const r of rows) {
    const acc = byMonth.get(r.report_month_key) ?? {
      report_month_key: r.report_month_key,
      created_count: 0,
      completed_count: 0,
      canceled_count: 0,
      completed_same_month_count: 0,
      backlog_end_of_month: 0,
    };
    acc.created_count += r.created_count;
    acc.completed_count += r.completed_count;
    acc.canceled_count += r.canceled_count;
    acc.completed_same_month_count += r.completed_same_month_count;
    acc.backlog_end_of_month += r.backlog_end_of_month;
    byMonth.set(r.report_month_key, acc);
  }
  return [...byMonth.values()].sort((a, b) =>
    a.report_month_key.localeCompare(b.report_month_key)
  );
}

export type CompanyLoad = {
  report_month_key: string;
  n_spaces: number;
  total_orders: number;
  problem_count: number;
  complaint_count: number;
  offer_count: number;
  question_count: number;
  service_count: number;
  other_type_count: number;
  problem_complaint_count: number;
  backlog_30d: number;
  tasks_from_orders: number;
  problem_complaint_tasks: number;
  employee_task_count: number;
  total_tasks: number;
};

/**
 * Компанія загалом по навантаженню.
 *
 * ⚠️ Частки (load_rate, complaint_rate, task_ratio) тут НЕ підсумовуються і
 * не усереднюються — вони рахуються заново з сум. Середнє відношень дало б
 * ЖК із двома заявками таку саму вагу, як ЖК із тисячею; ця пастка вже
 * ловилась на пончику ОС у продуктовому дашборді.
 */
export function companyLoad(rows: LoadMonthly[]): CompanyLoad[] {
  const byMonth = new Map<string, CompanyLoad>();
  for (const r of rows) {
    const acc = byMonth.get(r.report_month_key) ?? {
      report_month_key: r.report_month_key,
      n_spaces: 0,
      total_orders: 0,
      problem_count: 0,
      complaint_count: 0,
      offer_count: 0,
      question_count: 0,
      service_count: 0,
      other_type_count: 0,
      problem_complaint_count: 0,
      backlog_30d: 0,
      tasks_from_orders: 0,
      problem_complaint_tasks: 0,
      employee_task_count: 0,
      total_tasks: 0,
    };
    acc.n_spaces += r.n_spaces;
    acc.total_orders += r.total_orders;
    acc.problem_count += r.problem_count;
    acc.complaint_count += r.complaint_count;
    acc.offer_count += r.offer_count;
    acc.question_count += r.question_count;
    acc.service_count += r.service_count;
    acc.other_type_count += r.other_type_count;
    acc.problem_complaint_count += r.problem_complaint_count;
    acc.backlog_30d += r.backlog_30d;
    acc.tasks_from_orders += r.tasks_from_orders;
    acc.problem_complaint_tasks += r.problem_complaint_tasks;
    acc.employee_task_count += r.employee_task_count;
    acc.total_tasks += r.total_tasks;
    byMonth.set(r.report_month_key, acc);
  }
  return [...byMonth.values()].sort((a, b) =>
    a.report_month_key.localeCompare(b.report_month_key)
  );
}

/**
 * Спільна обгортка періоду для сторінок заявок.
 *
 * Ці сторінки ПОКАЗУЮТЬ поточний незавершений місяць (як «Огляд ЖК»): кожен
 * місяць тут самостійний підрахунок подій, а не ковзне вікно, тому неповний
 * місяць означає просто «дані станом на сьогодні». На сторінках ризику й
 * сегментів рішення протилежне — там тримісячні вікна, і неповний місяць
 * викривлює їх; не переносити механічно.
 */
function buildPeriod<T extends { report_month_key: string }>(
  all: T[],
  params?: Record<string, string | string[] | undefined>
) {
  const bounds = {
    min: all[0].report_month_key,
    max: all.at(-1)!.report_month_key,
  };
  const r: Range = params
    ? resolveRange(params, bounds)
    : { from: bounds.min, to: bounds.max };

  const base = all.filter(
    (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
  );
  const cur = base.at(-1) ?? all.at(-1)!;
  const curIdx = all.findIndex(
    (x) => x.report_month_key === cur.report_month_key
  );
  const prev = all[Math.max(0, curIdx - 1)];

  return {
    all,
    base,
    bounds,
    range: r,
    cur,
    prev,
    curKey: cur.report_month_key,
    prevKey: prev.report_month_key,
    isPartial: cur.report_month_key === currentMonthKey(),
    daysElapsed: new Date().getDate(),
    daysInMonth: new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate(),
    inWindow: <R extends { report_month_key: string }>(rows: R[]) =>
      rows.filter(
        (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
      ),
  };
}

/** Період сторінки «Операційна ефективність». */
export function getSlaPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const raw = getSla();
  return {
    ...buildPeriod(companySla(raw), params),
    raw,
    byComplex: (monthKey: string) =>
      raw.filter((x) => x.report_month_key === monthKey && x.created_count > 0),
  };
}

/**
 * Період сторінки «Аналітика звернень».
 *
 * Межі беруться з `agg_load_monthly` (повна історія), а не з категорій:
 * категорії вивантажуються вікном 24 місяці, і якби межі йшли звідти, на
 * сторінці мовчки зникала б уся історія до 2024-го. Блоки, що читають
 * категорії, самі порожні поза вікном — це видно, на відміну від обрізаного
 * дейт-пікера.
 */
export function getRequestsPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const raw = getLoad();
  return { ...buildPeriod(companyLoad(raw), params), raw };
}

/** Період сторінки «Антирейтинг: скарги та навантаження». */
export function getLoadPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const raw = getLoad();
  return {
    ...buildPeriod(companyLoad(raw), params),
    raw,
    /**
     * ЖК місяця, у яких узагалі щось відбувалось. Порожній ЖК (БЦ «Арсенал»
     * — одне приміщення, нуль заявок) інакше стоїть у кожному рейтингу з
     * нулем і читається як «дуже добре», хоча означає «даних немає».
     */
    byComplex: (monthKey: string) =>
      raw.filter(
        (x) =>
          x.report_month_key === monthKey &&
          x.n_spaces > 0 &&
          (x.total_orders > 0 || x.total_tasks > 0)
      ),
  };
}

// ── CSAT ────────────────────────────────────────────────────────────────

export const getCsatComplexes = () => load<CsatComplex>("agg_csat_complex");
export const getCsatWaves = () => loadCompact<CsatWave>("agg_csat_waves");
export const getCsatComments = () =>
  loadCompact<CsatComment>("agg_csat_comments");
export const getCsatProblems = () => load<CsatProblem>("agg_csat_problems");

/**
 * Хвилі в хронологічному порядку.
 *
 * ⚠️ Сортувати можна ТІЛЬКИ за `wave_month_key`, а не за текстом мітки:
 * «Будинкова черв. 2026» і «Охорона груд. 2025» алфавітно йдуть у зворотному
 * до часу порядку. Ключ хвилі в марті (`wave_sort_id`) сюди свідомо не їде —
 * попри назву він не константа в межах хвилі (це min(survey_id) на РЯДОК
 * хвиля×ЖК×будинок), тому як ключ хвилі не годиться.
 * Другий ключ — назва: у межах місяця буває дві хвилі різних категорій.
 */
export function csatWaveOrder(rows: CsatWave[]): string[] {
  const byLabel = new Map<string, string>();
  for (const r of rows) byLabel.set(r.wave_label, r.wave_month_key);
  return [...byLabel.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

/** Середня оцінка набору рядків — завжди через суми, ніколи середнє середніх. */
export const csatAvg = (rows: Array<{ grade_sum: number; votes: number }>) => {
  const votes = rows.reduce((a, r) => a + r.votes, 0);
  return votes > 0 ? rows.reduce((a, r) => a + r.grade_sum, 0) / votes : null;
};

export const getChurnStages = () =>
  load<ChurnStageMonthly>("agg_churn_stage_monthly");
export const getHouses = () => load<HouseMonthly>("agg_houses_monthly");
export const getSegments = () => load<SegmentMonthly>("agg_segment_monthly");
export const getSegmentsByComplex = () =>
  load<SegmentComplexMonthly>("agg_segment_complex_monthly");
export const getCampaigns = () => load<Campaign>("mart_campaigns");

/**
 * Період операційних сторінок.
 *
 * ⚠️ Тут НЕМАЄ поточного місяця, і це навмисно: `mart_house_churn_risk_monthly`
 * його свідомо не рахує. Тримісячні вікна на неповному місяці просідають
 * штучно, і стадія «пішли» спрацьовує на половині будинків. Тому й позначки
 * «місяць триває» на цих сторінках бути не може — останній місяць завжди
 * повний. У продуктовому дашборді рішення протилежне (там показуємо поточний
 * незавершений місяць із позначкою) — не переносити його сюди механічно.
 */
export function getChurnPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const all = getChurnStages();
  const bounds = {
    min: all[0].report_month_key,
    max: all.at(-1)!.report_month_key,
  };
  const r: Range = params
    ? resolveRange(params, bounds)
    : { from: bounds.min, to: bounds.max };

  const base = all.filter(
    (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
  );

  // `prev` шукаємо в повному наборі, а не в діапазоні: якщо обрано один
  // місяць, порівнювати все одно треба з попереднім.
  const cur = base.at(-1) ?? all.at(-1)!;
  const curIdx = all.findIndex(
    (x) => x.report_month_key === cur.report_month_key
  );
  const prev = all[Math.max(0, curIdx - 1)];

  return {
    base,
    bounds,
    range: r,
    cur,
    prev,
    curKey: cur.report_month_key,
    prevKey: prev.report_month_key,
    inWindow: <T extends { report_month_key: string }>(rows: T[]) =>
      rows.filter(
        (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
      ),
  };
}

/**
 * Період сторінки «Напруга і сегменти».
 *
 * Окремо від `getChurnPeriod`, хоча межі однакові: там ряд по БУДИНКАХ, тут
 * по ЛЮДЯХ, і `cur`/`prev` мають бути з відповідного ряду. Спокуса передати
 * один період на обидві сторінки закінчилась би тим, що дельта «+3» на
 * сторінці людей показувала б різницю в будинках.
 *
 * Поточного місяця тут теж немає: `fct_resident_friction_monthly` рахує
 * тримісячне вікно, на неповному місяці воно просідає штучно.
 */
export function getSegmentPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const all = getSegments();
  const bounds = {
    min: all[0].report_month_key,
    max: all.at(-1)!.report_month_key,
  };
  const r: Range = params
    ? resolveRange(params, bounds)
    : { from: bounds.min, to: bounds.max };

  const base = all.filter(
    (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
  );
  const cur = base.at(-1) ?? all.at(-1)!;
  const curIdx = all.findIndex(
    (x) => x.report_month_key === cur.report_month_key
  );
  const prev = all[Math.max(0, curIdx - 1)];

  return {
    all,
    base,
    bounds,
    range: r,
    cur,
    prev,
    curKey: cur.report_month_key,
    prevKey: prev.report_month_key,
    inWindow: <T extends { report_month_key: string }>(rows: T[]) =>
      rows.filter(
        (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
      ),
  };
}

// ── Реєстр метрик ───────────────────────────────────────────────────────

export type MetricStatus = "active" | "known_issue" | "needs_decision";

export type Metric = {
  id: string;
  label: string;
  definition: string;
  formula?: string;
  grain?: string;
  source?: string;
  owner?: string;
  status?: MetricStatus;
  note?: string;
};

/**
 * Довідка по метриці за її ПІДПИСОМ на дашборді. Розсинхрон «підпис змінили,
 * а в реєстрі ні» не ловиться очима — довідка просто тихо зникає. Тому є
 * `scripts/check-metric-coverage.mjs`, який падає на збірці.
 */
let metricsByLabel: Map<string, Metric> | null = null;

export function getMetric(label: string): Metric | undefined {
  if (!metricsByLabel) {
    const doc = JSON.parse(
      readFileSync(join(DATA_DIR, "metrics.json"), "utf8")
    ) as { metrics: Metric[] };
    metricsByLabel = new Map(doc.metrics.map((m) => [m.label, m]));
  }
  return metricsByLabel.get(label);
}

/** Кілька метрик однієї картки; невідомі ключі відкидаються. */
export function getMetrics(labels: string | string[]): Metric[] {
  return (Array.isArray(labels) ? labels : [labels])
    .map(getMetric)
    .filter((m): m is Metric => Boolean(m));
}
