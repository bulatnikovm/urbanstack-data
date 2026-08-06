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

/** Прибирає порядковий префікс "3. " з назв категорій/модулів */
export const stripOrder = (s: string) => s.replace(/^\d+\.\s*/, "");
