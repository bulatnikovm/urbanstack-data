/**
 * Період дашборду — діапазон МІСЯЦІВ, спільний для всіх сторінок.
 *
 * Чому місяці, а не дні: усі марти мають грануляцію `report_month`. Поденний
 * календар обіцяв би точність, якої в даних немає — «з 12 лютого» все одно
 * означало б «з лютого».
 *
 * Діапазон живе в URL (`?from=2024-01&to=2026-08`), а не в стані компонента:
 * посилання на конкретний період можна кинути Максиму чи Артему, і вони
 * побачать те саме. Для дашборду, головна цінність якого — шеринг, це не
 * дрібниця.
 */

export type Range = { from: string; to: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (v: unknown): v is string =>
  typeof v === "string" && MONTH_RE.test(v);

/** "2026-08" → "2026-03" при shift = -5 */
export function shiftMonth(key: string, months: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Усі місяці діапазону включно, за зростанням */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // Захист від нескінченного циклу на зіпсованому вводі
  for (let i = 0; i < 600 && cur <= to; i++) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

/**
 * Нормалізує діапазон із URL: відкидає сміття, впорядковує кінці й
 * затискає в межі наявних даних. Ніколи не кидає — на будь-якому вводі
 * повертає робочий діапазон, бо URL приходить іззовні.
 */
export function resolveRange(
  params: Record<string, string | string[] | undefined>,
  bounds: { min: string; max: string }
): Range {
  const raw = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  let from = isMonthKey(raw("from")) ? (raw("from") as string) : bounds.min;
  let to = isMonthKey(raw("to")) ? (raw("to") as string) : bounds.max;

  if (from > to) [from, to] = [to, from];

  // Затиск у межі даних: інакше ?from=1999-01 розтягне вісь у порожнечу
  if (from < bounds.min) from = bounds.min;
  if (to > bounds.max) to = bounds.max;

  return { from, to };
}

/** Пресети швидкого вибору. `months: null` — увесь наявний період. */
export const PRESETS: Array<{ label: string; months: number | null }> = [
  { label: "6 місяців", months: 6 },
  { label: "12 місяців", months: 12 },
  { label: "24 місяці", months: 24 },
  { label: "Увесь час", months: null },
];

/**
 * "12 місяців" означає "той самий місяць рік тому — і по сьогодні" (напр.
 * серпень 2025 → серпень 2026), тобто 13 точок на графіку, не 12. Рахуємо
 * зсув через календарний рік (`shiftMonth(-12)`), а не `-(months-1)` — те
 * саме мало б плутати й "6 місяців" (лют→серп, 7 точок), якби це справді
 * була кількість точок, а не "N місяців тому".
 */
export function presetRange(
  months: number | null,
  bounds: { min: string; max: string }
): Range {
  if (months === null) return { from: bounds.min, to: bounds.max };
  const from = shiftMonth(bounds.max, -months);
  return { from: from < bounds.min ? bounds.min : from, to: bounds.max };
}
