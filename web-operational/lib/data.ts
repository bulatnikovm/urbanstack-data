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
