const nf = new Intl.NumberFormat("uk-UA");
const nf1 = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 });

export const n = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf.format(Math.round(v));

export const n1 = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf1.format(v);

/** Частка 0..1 → "55,7%" */
export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("uk-UA", {
        style: "percent",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(v);

/**
 * Різниця часток у процентних пунктах — "+1,4 п.п."
 * Зміни, менші за 0,05 п.п., округлились би до "−0 п.п." і читались як баг,
 * тому називаємо їх тим, чим вони є.
 */
export const pp = (v: number) =>
  Math.abs(v) * 100 < 0.05
    ? "без змін"
    : `${v >= 0 ? "+" : "−"}${nf1.format(Math.abs(v) * 100)} п.п.`;

/** Відносна зміна — "+12,3%" */
export const delta = (v: number) =>
  Math.abs(v) * 100 < 0.05
    ? "без змін"
    : `${v >= 0 ? "+" : "−"}${nf1.format(Math.abs(v) * 100)}%`;

const MONTHS = [
  "січ", "лют", "бер", "квіт", "трав", "черв",
  "лип", "серп", "вер", "жовт", "лист", "груд",
];

/** "2026-07" → "лип 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * "2026-07" → "лип" (для осей графіків).
 * Марти можуть містити службові ключі (напр. "ALL" — підсумок за весь час);
 * такий ключ повертаємо як є, а не як undefined.
 */
export function monthShort(key: string): string {
  const [y, m] = String(key).split("-");
  const idx = Number(m) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx > 11) return String(key);
  return idx === 0 ? `${MONTHS[0]} ${y.slice(2)}` : MONTHS[idx];
}

/** "2026-06" → "Черв. 2026" — заголовок тултипа: з великої, зі скороченням і роком */
export function monthTooltip(key: string): string {
  const [y, m] = String(key).split("-");
  const idx = Number(m) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx > 11) return String(key);
  const name = MONTHS[idx];
  return `${name[0].toUpperCase()}${name.slice(1)}. ${y}`;
}

export function snapshotLabel(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Скільки годин минуло від зрізу — для бейджа свіжості */
export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}
