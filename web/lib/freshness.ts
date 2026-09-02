import { getMeta as getProductMeta } from "@/lib/data";
import { getMeta as getOperationalMeta } from "@/lib/data-operational";

/**
 * Наскільки свіжі дані на дашборді — і чи не пропустили ми оновлення.
 *
 * ── Чому не «скільки годин минуло» ────────────────────────────────────────
 * Було саме так: до 36 годин — зелена крапка, далі «потребує оновлення».
 * 28.08.2026 нічний прогін не стартував узагалі, дашборд показував дані від
 * 27.08, 20:30 — і крапка лишалась ЗЕЛЕНОЮ, бо минуло 19 годин. Тобто
 * єдиний індикатор, який мав ловити рівно цю ситуацію, її не ловив: дірка в
 * добу коротша за поріг у півтори.
 *
 * Тому лічимо не години, а ДОБИ за київським календарем — у тих самих
 * одиницях, у яких працює конвеєр: він має відпрацювати раз на день, і
 * питання завжди одне — «зріз сьогоднішній чи вчорашній».
 *
 * ── Вікно очікування ──────────────────────────────────────────────────────
 * Уранці вчорашній зріз — це ще не проблема: прогін міг не завершитись.
 * Тому до `GRACE_HOUR` вчорашні дані вважаються свіжими.
 *
 * Поріг — 09:00, і він виведений з обіцянки, а не зі смаку: Cloud Scheduler
 * запускає оновлення о 07:00 за Києвом, повний цикл (прогін GitHub ~8 хв +
 * пересборка Vercel) укладається в чверть години, і о 08:00 дані мають бути
 * на екрані. Година зверху — запас на повільний `dbt build` чи чергу
 * Vercel. Після девʼятої вчорашній зріз означає рівно те, що написано в
 * банері: не відпрацювало.
 *
 * ⚠️ Розклад живе у двох місцях — задача Cloud Scheduler
 * (`ops/setup-refresh-scheduler.sh`) і страхувальні `schedule` у
 * `.github/workflows/refresh-dashboard.yml`. Тут третя копія цього знання,
 * у вигляді години-порога. Зсунеться запуск — зсувати й `GRACE_HOUR`,
 * інакше банер почне брехати в обидва боки.
 */

export type FreshnessState =
  /** Зріз сьогоднішній — або вчорашній, але ранок ще не скінчився. */
  | "fresh"
  /** Зріз учорашній, а час оновлення вже минув: прогін не пройшов. */
  | "late"
  /** Зріз старший за добу — конвеєр стоїть не перший день. */
  | "stale";

/** Після цієї години за Києвом вчорашній зріз означає «оновлення не пройшло». */
const GRACE_HOUR = 9;

/** Календарна дата в Києві як число YYYYMMDD — щоб віднімати доби, а не мілісекунди. */
function kyivParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return {
    // Date.UTC із київських Y/M/D — це «опівніч цієї київської доби» в
    // порівнюваних одиницях. Різниця двох таких значень дає рівно кількість
    // діб, без ефектів переходу на літній час.
    dayStart: Date.UTC(get("year"), get("month") - 1, get("day")),
    hour: get("hour"),
  };
}

export type Freshness = {
  state: FreshnessState;
  /** Скільки київських діб між зрізом і сьогодні: 0 — сьогоднішній. */
  ageDays: number;
  /** Момент зрізу (ISO) — найстаріший із двох доменів, див. нижче. */
  snapshotAt: string;
};

export function assessFreshness(snapshotAt: string, now = new Date()): Freshness {
  const snap = kyivParts(new Date(snapshotAt));
  const today = kyivParts(now);
  const ageDays = Math.round((today.dayStart - snap.dayStart) / 864e5);

  const state: FreshnessState =
    ageDays <= 0
      ? "fresh"
      : ageDays === 1
        ? today.hour < GRACE_HOUR
          ? "fresh"
          : "late"
        : "stale";

  return { state, ageDays, snapshotAt };
}

/**
 * Свіжість дашборду цілком.
 *
 * Береться СТАРІШИЙ із двох зрізів (продуктового й операційного). Обидва
 * пише один прогін із різницею в секунди, але якщо колись відвалиться
 * половина конвеєра — чесніше показати гіршу з двох цифр, ніж кращу.
 */
export function dashboardFreshness(now = new Date()): Freshness {
  const a = getProductMeta().snapshot_at;
  const b = getOperationalMeta().snapshot_at;
  return assessFreshness(a < b ? a : b, now);
}
