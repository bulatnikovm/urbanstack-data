/**
 * Читання вивантажених mart'ів. Викликається ТІЛЬКИ з серверних компонентів —
 * тому сирі JSON (разом з 690 KB mart_app_health_weekly) не потрапляють
 * у клієнтський бандл, у браузер їде лише те, що реально малюється.
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
 * scripts/export-data.mjs) — той самий формат і той самий код, що в
 * lib/data-operational.ts. Сторінки різниці не бачать: стиснення живе
 * тільки на межі файлу.
 *
 * Тут воно з'явилось разом з adoption-вітринами: у них грануляція по
 * будинках, і адреса з назвою ЖК повторювались у кожному з 6,3 тис. рядків —
 * 3,0 МБ наївним JSON проти 0,3 МБ словниковим. Платить за це історія git
 * (файли перезаписуються щодня), а не браузер.
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

// ── Типи mart'ів (дзеркалять схему dbt_product) ─────────────────────────

export type UserBaseTotals = {
  report_month: string;
  report_month_key: string;
  count_potential: number;
  count_confirmed: number;
  rate_confirmed: number;
  excluded_role_deactivated: number;
  excluded_house_deactivated: number;
  visitors: number;
  active_core_mau: number;
  visitors_devices: number;
  devices_inflation_rate: number;
  rate_visitors_of_confirmed: number;
  rate_mau_of_confirmed: number;
};

export type UserBaseByComplex = {
  report_month_key: string;
  complex_id: string;
  complex_name: string;
  count_potential: number;
  count_confirmed: number;
  rate_confirmed: number;
  visitors: number;
  active_core_mau: number;
};

export type SegmentsMonthly = {
  report_month_key: string;
  complex_name: string;
  confirmed_users: number;
  segment_alive: number;
  segment_sleeping: number;
  segment_dead: number;
};

export type ActivationMonthly = {
  report_month_key: string;
  count_new_users: number;
  count_activated: number;
  count_passively_activated: number;
  activation_rate: number;
};

export type TimeToValue = {
  report_month_key: string;
  n_users_with_value_action: number;
  within_1h: number;
  within_1d: number;
  within_7d: number;
  within_30d: number;
  rate_1h: number;
  rate_1d: number;
  rate_7d: number;
  rate_30d: number;
};

export type EngagementMonthly = {
  report_month_key: string;
  avg_daily_core_users: number;
  n_sessions: number;
  median_session_min: number;
  p90_session_min: number;
  median_user_time_min: number;
  p90_user_time_min: number;
  avg_user_time_min: number;
  voting_saw_users: number;
  voting_voted_users: number;
  voting_conversion_rate: number;
  app_requests_created_users: number;
  app_paid_requests_created_users: number;
};

export type UtilityReceiptsMonthly = {
  report_month_key: string;
  receipts_accepted: number;
  receipts_rejected: number;
  receipts_rejected_rate: number;
  receipts_accepted_amount: number;
  receipts_accepted_avg_amount: number;
};

export type StarMonthly = {
  report_month_key: string;
  star_category: string;
  unique_users: number;
  count_confirmed: number;
  star_rate: number;
  star_rate_of_confirmed: number;
  mom_change_pct: number;
};

export type ModuleUsageMonthly = {
  report_month_key: string;
  module_code: string;
  module_name_ua: string;
  module_order: number;
  module_users: number;
  penetration_rate: number;
  median_time_min: number;
};

export type ModuleRetention = {
  module_name_ua: string;
  module_order: number;
  drop_off_window_days: number;
  total_users_tried: number;
  true_module_drop_off_rate: number;
  median_days_before_drop: number;
};

export type VersionAdoption = {
  report_month_key: string;
  os_type: string;
  app_version: string;
  version_major: number;
  version_minor: number;
  version_patch: number;
  active_users: number;
  active_devices: number;
};

export type AppHealthWeekly = {
  event_week: string;
  os_type: string;
  app_version: string;
  weekly_active_users: number;
  forced_logout_users: number;
  forced_logout_rate: number | null;
  total_bio_users: number;
  technical_friction_users: number;
  biometric_fallback_users: number;
  technical_friction_rate: number | null;
  biometric_fallback_rate: number | null;
};

/**
 * Помилки застосунку.
 *
 * `error_class` розділяє три різні речі, які не можна складати в одне
 * «скільки в нас помилок»:
 *   app    — зламався застосунок або бекенд (екран помилки, оплата, послуга);
 *   auth   — тертя на вході (невірний PIN, код), здебільшого сам користувач;
 *   access — прав немає або номера немає в базі: питання до операційки й
 *            підключення, а не до розробки.
 */
export type AppErrorMonthly = {
  report_month: string;
  report_month_key: string;
  error_kind: string;
  error_class: "app" | "auth" | "access";
  label_ua: string;
  hint_ua: string | null;
  affected_users: number;
  error_events: number;
  active_users: number;
  affected_rate: number | null;
  events_per_affected: number | null;
};

/**
 * Зведення по класах. ⚠️ Рядок `any` — НЕ сума трьох інших: людина з двома
 * видами помилок є в кожному своєму класі, а в `any` рівно один раз.
 */
export type AppErrorSummary = {
  report_month: string;
  report_month_key: string;
  error_class: "app" | "auth" | "access" | "any";
  affected_users: number;
  error_events: number;
  active_users: number;
  affected_rate: number | null;
  events_per_affected: number | null;
};

export type AppErrorWeekly = {
  event_week: string;
  os_type: string;
  app_version: string;
  error_kind: string;
  error_class: "app" | "auth" | "access";
  label_ua: string;
  affected_users: number;
  error_events: number;
  version_active_users: number;
  affected_rate: number | null;
  events_per_affected: number | null;
};

export type UserSegments = {
  activity_segment: string;
  version_status: string;
  os_type: string;
  users_count: number;
};

export type Meta = {
  snapshot_at: string;
  dataset: string;
  tables: Record<string, { rows: number }>;
};

// ── Підключення мешканців ───────────────────────────────────────────────

/** Сквозна воронка на рівні будинку. Грануляція: report_month × house_id. */
export type AdoptionFunnelMonthly = {
  report_month: string;
  report_month_key: string;
  house_id: string;
  house_address: string;
  complex_id: string;
  complex_name: string;
  house_opened_date: string | null;
  n_potential: number;
  n_registered: number;
  n_visitors: number;
  n_core_active: number;
  n_never_registered: number;
};

/**
 * Випереджальний показник: будинок × місяць провізіонінгу × тип приміщення.
 *
 * ⚠️ ТІЛЬКИ ЛІЧИЛЬНИКИ. Частку рахувати ВИКЛЮЧНО як n_reg_Nd / n_mature_Nd
 * із суми за обраний період — у самій вітрині відсотка немає навмисно, бо на
 * грануляції «будинок × місяць» більшість клітинок має менш ніж 20 людей.
 */
export type AdoptionHouseMonthly = {
  provision_month: string;
  provision_month_key: string;
  house_id: string;
  house_address: string;
  complex_id: string;
  complex_name: string;
  property_kind: "apartment" | "commercial";
  property_kind_ua: string;
  house_opened_date: string | null;
  n_provisioned: number;
  n_mature_7d: number;
  n_reg_7d: number;
  n_mature_30d: number;
  n_reg_30d: number;
  n_mature_90d: number;
  n_reg_90d: number;
  n_ever_opened: number;
  n_never_opened: number;
  n_registered: number;
  n_d0: number;
  n_d1_7: number;
  n_d8_30: number;
  n_d31_90: number;
  n_d90plus: number;
  n_never: number;
};

// ── Доступ ──────────────────────────────────────────────────────────────

export const getMeta = (): Meta =>
  JSON.parse(readFileSync(join(DATA_DIR, "_meta.json"), "utf8"));

export const getUserBaseTotals = () =>
  load<UserBaseTotals>("mart_user_base_totals_monthly");
export const getUserBaseByComplex = () =>
  load<UserBaseByComplex>("mart_user_base_monthly");
export const getSegmentsMonthly = () =>
  load<SegmentsMonthly>("mart_user_segments_monthly");
export const getActivation = () =>
  load<ActivationMonthly>("mart_activation_monthly");
export const getTimeToValue = () => load<TimeToValue>("mart_time_to_value");
export const getEngagement = () =>
  load<EngagementMonthly>("mart_engagement_monthly");
export const getUtilityReceipts = () =>
  load<UtilityReceiptsMonthly>("mart_utility_receipts_monthly");
export const getStar = () => load<StarMonthly>("mart_star_monthly");
export const getModuleUsage = () =>
  load<ModuleUsageMonthly>("mart_module_usage_monthly");
export const getModuleRetention = () =>
  load<ModuleRetention>("mart_module_retention");
export const getAppHealth = () =>
  load<AppHealthWeekly>("mart_app_health_weekly");
export const getAppErrorsMonthly = () =>
  load<AppErrorMonthly>("mart_app_errors_monthly");
export const getAppErrorsWeekly = () =>
  load<AppErrorWeekly>("mart_app_errors_weekly");
export const getAppErrorSummary = () =>
  load<AppErrorSummary>("mart_app_error_summary_monthly");
export const getAdoptionFunnel = () =>
  loadCompact<AdoptionFunnelMonthly>("mart_adoption_funnel_monthly");
export const getAdoptionByHouse = () =>
  loadCompact<AdoptionHouseMonthly>("mart_adoption_house_monthly");

/**
 * Згортка лічильників підключення. Приймає НАБІР рядків і рахує частки з
 * суми — тому одна клітинка місяця й підсумок за період проходять через ту
 * саму формулу, і порахувати їх по-різному фізично неможливо (той самий
 * принцип, що в підсумковій колонці SLA).
 *
 * Частка — `null`, а не нуль, коли знаменник порожній: «0% зареєструвалось»
 * на нульовій базі це не вимір, а його відсутність. Сторінка малює «—».
 */
export type AdoptionRollup = {
  provisioned: number;
  mature7: number;
  reg7: number;
  rate7: number | null;
  mature30: number;
  reg30: number;
  rate30: number | null;
  mature90: number;
  reg90: number;
  rate90: number | null;
  everOpened: number;
  neverOpened: number;
  rateNever: number | null;
  buckets: { d0: number; d1_7: number; d8_30: number; d31_90: number; d90plus: number; never: number };
};

export function adoptionRollup(rows: AdoptionHouseMonthly[]): AdoptionRollup {
  const s = (f: (r: AdoptionHouseMonthly) => number) =>
    rows.reduce((a, r) => a + f(r), 0);
  const provisioned = s((r) => r.n_provisioned);
  const mature7 = s((r) => r.n_mature_7d);
  const mature30 = s((r) => r.n_mature_30d);
  const mature90 = s((r) => r.n_mature_90d);
  const reg7 = s((r) => r.n_reg_7d);
  const reg30 = s((r) => r.n_reg_30d);
  const reg90 = s((r) => r.n_reg_90d);
  const neverOpened = s((r) => r.n_never_opened);
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    provisioned,
    mature7,
    reg7,
    rate7: div(reg7, mature7),
    mature30,
    reg30,
    rate30: div(reg30, mature30),
    mature90,
    reg90,
    rate90: div(reg90, mature90),
    everOpened: s((r) => r.n_ever_opened),
    neverOpened,
    rateNever: div(neverOpened, provisioned),
    buckets: {
      d0: s((r) => r.n_d0),
      d1_7: s((r) => r.n_d1_7),
      d8_30: s((r) => r.n_d8_30),
      d31_90: s((r) => r.n_d31_90),
      d90plus: s((r) => r.n_d90plus),
      never: s((r) => r.n_never),
    },
  };
}

// ── Поточний місяць неповний ────────────────────────────────────────────

/** Ключ поточного (можливо, ще незавершеного) місяця — "2026-08". */
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}


/**
 * Спільний період для всіх сторінок.
 *
 * `cur` — ОСТАННІЙ НАЯВНИЙ місяць, включно з поточним незавершеним.
 * Рішення Микити (2026-08-05): бачити стан «як зараз» важливіше за
 * коректність порівняння. Наслідок, який треба тримати в голові: 5 серпня
 * усі помісячні лічильники будуть у ~6 разів менші за липневі, і дельти
 * покажуть падіння, якого насправді немає. Тому `isPartial` є — щоб
 * позначити такий місяць прямо в шапці, а не мовчки.
 *
 * `minKey` не косметика: у mart_activation_monthly є когорти "2010-01" і
 * "2022-06" (по 1 користувачу — зіпсований created_at у джерелі). Без
 * обрізання вісь розтягується на 16 років і реальні дані злипаються біля
 * правого краю. Беремо початок бази користувачів як спільне вікно, щоб
 * періоди на різних сторінках можна було порівнювати між собою.
 */
export function getPeriod(
  params?: Record<string, string | string[] | undefined>
) {
  const all = getUserBaseTotals();
  const bounds = {
    min: all[0].report_month_key,
    max: all.at(-1)!.report_month_key,
  };
  // Резолв усередині, а не в кожній сторінці: межі відомі тільки тут, і
  // дублювати «спочатку bounds, потім resolveRange» у пʼятьох файлах — це
  // пʼять місць, де вони можуть розʼїхатись.
  const r: Range = params
    ? resolveRange(params, bounds)
    : { from: bounds.min, to: bounds.max };

  const base = all.filter(
    (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
  );

  // `cur` — останній місяць ДІАПАЗОНУ. `prev` шукаємо в повному наборі, а не
  // в діапазоні: якщо обрано один місяць, порівнювати все одно треба з
  // попереднім, і він не має зникати лише тому, що не потрапив у вікно.
  const cur = base.at(-1) ?? all.at(-1)!;
  const curIdx = all.findIndex((x) => x.report_month_key === cur.report_month_key);
  const prev = all[Math.max(0, curIdx - 1)];
  const minKey = r.from;

  return {
    base,
    bounds,
    range: r,
    cur,
    prev,
    curKey: cur.report_month_key,
    prevKey: prev.report_month_key,
    /** Поточний місяць ще триває — цифри неповні */
    isPartial: cur.report_month_key === currentMonthKey(),
    /** Скільки днів місяця вже минуло (для підпису «5 з 31») */
    daysElapsed: new Date().getDate(),
    daysInMonth: new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate(),
    minKey,
    /** Обрізає будь-який часовий ряд до обраного діапазону */
    inWindow: <T extends { report_month_key: string }>(rows: T[]) =>
      rows.filter(
        (x) => x.report_month_key >= r.from && x.report_month_key <= r.to
      ),
    at: <T extends { report_month_key: string }>(rows: T[], k: string) =>
      rows.find((x) => x.report_month_key === k),
    /**
     * Те саме, що `at`, але для МІСЯЦЯ, якого в цьому ряду ще немає, віддає
     * нульовий рядок замість `undefined`.
     *
     * Навіщо: `curKey` — один на сторінку й береться з бази користувачів, а
     * марти мають РІЗНЕ покриття. 01.09.2026 у `mart_user_base_totals_monthly`
     * вересень уже був, а в `mart_activation_monthly` і
     * `mart_utility_receipts_monthly` — ще ні (нових користувачів і квитанцій
     * за перші години доби просто не було). Сторінки писали `at(rows, curKey)!`,
     * знак оклику брехав компілятору, і /activation та /engagement віддавали
     * 500. Пастка спрацьовує ПЕРШОГО ЧИСЛА кожного місяця й тільки тоді —
     * тому й дожила до вересня.
     *
     * Нуль тут — чесне значення для ЛІЧИЛЬНИКІВ: рядка немає саме тому, що
     * нічого не сталось.
     *
     * ⚠️ Для ЧАСТОК і СЕРЕДНІХ нуль чесним не є: «конверсія 0%» на базі з
     * нуля людей — це не вимір, а його відсутність. Тому сторінка, яка
     * показує частку, зобовʼязана сама перевірити базу й намалювати «—»
     * (той самий принцип, що й `MIN_RATE_BASE` на /health).
     */
    atOrZero: <T extends { report_month_key: string }>(
      rows: T[],
      k: string
    ): T | undefined => {
      const hit = rows.find((x) => x.report_month_key === k);
      if (hit) return hit;
      const shape = rows.at(-1);
      if (!shape) return undefined;
      const zero: Record<string, unknown> = { ...shape, report_month_key: k };
      for (const key of Object.keys(zero)) {
        if (typeof zero[key] === "number") zero[key] = 0;
      }
      return zero as T;
    },
  };
}

export type OsMonthly = {
  report_month_key: string;
  os_type: string;
  users: number;
};

export const getOsMonthly = () => load<OsMonthly>("agg_os_monthly");

export const getVersionAdoption = () =>
  load<VersionAdoption>("mart_version_adoption");
export const getUserSegments = () => load<UserSegments>("mart_user_segments");

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
  /** З якого реєстру запис — проставляє build-metrics.mjs. */
  domain?: "product" | "operational";
};

/**
 * Довідка по метриці за її ПІДПИСОМ на дашборді (не за PROD-ID): так
 * компонент картки не мусить знати кодів. Дублікати підписів відсіює
 * build-metrics.mjs на збірці.
 *
 * ⚠️ Розсинхрон «підпис змінили, а в реєстрі ні» НЕ ловиться очима — довідка
 * просто тихо зникає, і помітити це можна лише випадково (так і сталося:
 * 21 картка з 52 була без довідки). Тому є `scripts/check-metric-coverage.mjs`
 * — він падає на збірці, якщо на дашборді зʼявилась картка без запису в
 * реєстрі. Це та сама логіка, що й seeds замість хардкод-списків: розходження
 * має бути неможливим структурно, а не «помітним».
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

/** Прибирає порядковий префікс "3. " з назв категорій/модулів */
export const stripOrder = (s: string) => s.replace(/^\d+\.\s*/, "");

// ── Наратив по аномаліях (шар B, dashboard_plan.md §7.2) ──────────────────

export type NarrativeSource =
  | "llm"
  | "template"
  | "template_rejected"
  | "no_anomalies";

export type NarrativeSection = { text: string; source: NarrativeSource };

export type NarrativeDoc = {
  generated_at: string;
  snapshot_at: string;
  report_month_key: string;
  report_month_label: string;
  model: string | null;
  sections: Record<string, NarrativeSection>;
};

let narrativeDoc: NarrativeDoc | null | undefined;

/**
 * Наратив для секції. Файл генерується окремим кроком складання
 * (scripts/build-narrative.mjs), тому його може не бути — тоді просто нічого
 * не показуємо. Дашборд не має падати через відсутній текст.
 */
export function getNarrative(
  section: string
): (NarrativeSection & { monthLabel: string; monthKey: string }) | null {
  if (narrativeDoc === undefined) {
    try {
      narrativeDoc = JSON.parse(
        readFileSync(join(DATA_DIR, "narrative.json"), "utf8")
      ) as NarrativeDoc;
    } catch {
      narrativeDoc = null;
    }
  }
  const s = narrativeDoc?.sections?.[section];
  if (!s || !narrativeDoc) return null;
  return {
    ...s,
    monthLabel: narrativeDoc.report_month_label,
    monthKey: narrativeDoc.report_month_key,
  };
}

/** Аномалії секції за місяць наративу — для позначок біля тексту. */
export function getInsights(section: string, monthKey: string) {
  let rows: Insight[];
  try {
    rows = load<Insight>("insights");
  } catch {
    return [];
  }
  return rows.filter(
    (r) => r.dashboard_section === section && r.report_month_key === monthKey
  );
}

export type Insight = {
  report_month_key: string;
  dashboard_section: string;
  series_key: string;
  label_ua: string;
  metric_id: string;
  dimension_key: string;
  dimension_value: string;
  month_status: string;
  source_kind: string;
  value_type: string;
  value: number;
  prev_value: number | null;
  mom_abs: number | null;
  mom_pct: number | null;
  robust_z: number | null;
  direction: string | null;
  direction_good: string;
  impact: string | null;
  severity: string | null;
  is_suspected_data_gap: boolean;
  verdict: string;
};
