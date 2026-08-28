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
 * Уранці вчорашній зріз — це норма, а не проблема: прогін ще не завершився.
 * Тому до `GRACE_HOUR` вчорашні дані вважаються свіжими. Поріг узятий з
 * реальної поведінки GitHub, а не з розкладу: за спостереженнями прогін
 * «06:17 UTC» стартує з затримкою 40-60 хвилин НАВІТЬ у нормальні дні
 * (06:40, 06:49, 06:50, 06:58 у різні дати), тож 12:00 за Києвом — це вже
 * впевнено «мало б бути, але немає», а не «ще їде».
 *
 * ⚠️ Розклад живе в `.github/workflows/refresh-dashboard.yml`, і тут його
 * копія тільки у вигляді години-порога. Якщо розклад зсунеться — зсунути й
 * `GRACE_HOUR`, інакше банер почне брехати в обидва боки.
 */

export type FreshnessState =
  /** Зріз сьогоднішній — або вчорашній, але ранок ще не скінчився. */
  | "fresh"
  /** Зріз учорашній, а час оновлення вже минув: прогін не пройшов. */
  | "late"
  /** Зріз старший за добу — конвеєр стоїть не перший день. */
  | "stale";

/** Після цієї години за Києвом вчорашній зріз означає «оновлення не пройшло». */
const GRACE_HOUR = 12;

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
