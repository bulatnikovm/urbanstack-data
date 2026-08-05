/**
 * Читання вивантажених mart'ів. Викликається ТІЛЬКИ з серверних компонентів —
 * тому сирі JSON (разом з 690 KB mart_app_health_weekly) не потрапляють
 * у клієнтський бандл, у браузер їде лише те, що реально малюється.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  median_hours_to_value: number;
  p90_hours_to_value: number;
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
export const getStar = () => load<StarMonthly>("mart_star_monthly");
export const getModuleUsage = () =>
  load<ModuleUsageMonthly>("mart_module_usage_monthly");
export const getModuleRetention = () =>
  load<ModuleRetention>("mart_module_retention");

// ── Поточний місяць неповний ────────────────────────────────────────────

/**
 * Місяць, у якому ми зараз, ще не закінчився — у ньому 5 днів даних проти 31.
 * Якщо цього не врахувати, дашборд покаже «−65% відвідувачів» і це буде
 * найгірший можливий тип помилки: правдоподібна, помітна й неправдива.
 *
 * Тому скрізь, де рахується «поточний стан» і дельта, беремо ОСТАННІЙ
 * ЗАВЕРШЕНИЙ місяць, а незавершений показуємо окремо й підписаним.
 */
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function splitComplete<T extends { report_month_key: string }>(
  rows: T[]
): { complete: T[]; partial: T[] } {
  const cur = currentMonthKey();
  return {
    complete: rows.filter((r) => r.report_month_key < cur),
    partial: rows.filter((r) => r.report_month_key >= cur),
  };
}

/**
 * Спільний період для всіх сторінок: останній ПОВНИЙ місяць, попередній
 * (для дельт), незавершений (для банера) і нижня межа вікна.
 *
 * `minKey` не косметика: у mart_activation_monthly є когорти "2010-01" і
 * "2022-06" (по 1 користувачу — зіпсований created_at у джерелі). Без
 * обрізання вісь розтягується на 16 років і реальні дані злипаються біля
 * правого краю. Беремо початок бази користувачів як спільне вікно, щоб
 * періоди на різних сторінках можна було порівнювати між собою.
 */
export function getPeriod() {
  const base = getUserBaseTotals();
  const { complete, partial } = splitComplete(base);
  const cur = complete.at(-1)!;
  const prev = complete.at(-2)!;
  const minKey = base[0].report_month_key;

  return {
    base,
    cur,
    prev,
    curKey: cur.report_month_key,
    prevKey: prev.report_month_key,
    partialKey: partial.at(-1)?.report_month_key,
    minKey,
    inWindow: <T extends { report_month_key: string }>(rows: T[]) =>
      rows.filter((r) => r.report_month_key >= minKey),
    at: <T extends { report_month_key: string }>(rows: T[], k: string) =>
      rows.find((r) => r.report_month_key === k),
  };
}

export const getVersionAdoption = () =>
  load<VersionAdoption>("mart_version_adoption");
export const getUserSegments = () => load<UserSegments>("mart_user_segments");

/** Прибирає порядковий префікс "3. " з назв категорій/модулів */
export const stripOrder = (s: string) => s.replace(/^\d+\.\s*/, "");
