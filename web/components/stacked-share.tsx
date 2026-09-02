import { monthAxis, monthLabel, n, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Стовпчики на 100%: із чого складається місяць.
 *
 * ── Чому не BklitBar ──────────────────────────────────────────────────────
 * `BklitBar` навмисно ставить серії ПОРУЧ, а не одна на одній: скруглення
 * там робиться через `rx` на `<rect>`, а він заокруглює всі чотири кути, і
 * в стеку це давало артефакт у будь-якому варіанті (див. коментар у самому
 * BklitBar). Тут стек — і є суть блоку, тому сегменти малюються прямими
 * прямокутниками, а роль скруглення виконують просвіти між ними.
 *
 * ── Чому шкала сірого, а не сім кольорів ─────────────────────────────────
 * Категорій сім, і розвести їх кольором надійно неможливо: на семи кроках
 * однієї шкали різниця між сусідніми виходить ΔE ≈ 8 при потрібних 15, а
 * сім різних яскравих відтінків і ламають монохромний хром дашборду, і все
 * одно зливаються при дальтонізмі. Врятувало те, що вимір ВПОРЯДКОВАНИЙ
 * (категорії пронумеровані), тож він чесно читається як шкала «світле →
 * темне», а не як сім незалежних сутностей. Рішення Микити 2026-09-02.
 *
 * ⚠️ Тому порядок серій — не косметика, а сам код кольору. Переставиш
 * категорії місцями — шкала почне брехати.
 *
 * Розрізняти сегменти кольору допомагають не тільки: між ними просвіт у
 * колір підкладки, на великих частках стоїть підпис, а під графіком —
 * легенда з тими самими зразками. Наведення на сегмент показує нативну
 * підказку з місяцем, категорією, часткою і кількістю людей.
 */

export type ShareSeries = {
  label: string;
  /** Значення в порядку місяців — рівно тієї ж довжини, що `months`. */
  values: number[];
};

/** Система координат SVG. Реальні пікселі задає CSS. */
const VB = { w: 1000, h: 300 };

/** Просвіт між сегментами, в одиницях viewBox. */
const GAP = 2;

/** З якої частки сегмент отримує підпис прямо на собі. */
const LABEL_FROM = 0.07;

/** Скільки максимум кроків має шкала — стільки ж токенів у globals.css. */
const STEPS = 7;

const stepVar = (i: number) => `var(--share-${Math.min(i + 1, STEPS)})`;

/**
 * Колір підпису НА сегменті. Свій на кожен крок, бо шкала проходить від
 * майже-фону до майже-чорного: один колір тексту читався б або на світлих
 * кроках, або на темних, але не на обох.
 */
const inkVar = (i: number) => `var(--share-fg-${Math.min(i + 1, STEPS)})`;

export function StackedShare({
  months,
  series,
  className,
}: {
  /** Ключі місяців за зростанням — вісь X. */
  months: string[];
  /** Серії в ПОРЯДКУ шкали: перша — найсвітліша. */
  series: ShareSeries[];
  className?: string;
}) {
  if (months.length === 0 || series.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        За вибраний період даних немає.
      </p>
    );
  }

  const colW = VB.w / months.length;
  // Стовпчик вужчий за свою колонку — інакше сусідні місяці злипаються в
  // суцільне полотно, і межа між ними читається як ще один сегмент.
  const barW = Math.min(colW * 0.68, 74);

  const totals = months.map((_, i) =>
    series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0)
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <svg
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="w-full"
        style={{ aspectRatio: "1000 / 300" }}
        role="img"
        aria-label="Структура цільових дій по місяцях, частки у відсотках"
      >
        {months.map((month, mi) => {
          const total = totals[mi];
          const x = mi * colW + (colW - barW) / 2;
          let y = 0;

          return (
            <g key={month}>
              {series.map((s, si) => {
                const value = s.values[mi] ?? 0;
                const share = total > 0 ? value / total : 0;
                const full = share * VB.h;
                // Просвіт відрізаємо ЗСЕРЕДИНИ сегмента, а не додаємо
                // зверху: інакше сума сегментів перестала б дорівнювати
                // висоті стовпчика і стек поповз би вище 100%.
                const h = Math.max(0, full - GAP);
                const top = y;
                y += full;
                if (full <= 0) return null;
                return (
                  <g key={s.label}>
                    <rect
                      x={x}
                      y={top}
                      width={barW}
                      height={h}
                      fill={stepVar(si)}
                    >
                      <title>
                        {`${monthLabel(month)} · ${s.label}: ${pct(share, 1)} (${n(value)} людей)`}
                      </title>
                    </rect>
                    {share >= LABEL_FROM && (
                      // Підпис — не на кожному сегменті: на частках менше
                      // 7% цифри накладаються одна на одну й перетворюють
                      // графік на кашу (саме це сталось в оригіналі).
                      <text
                        x={x + barW / 2}
                        y={top + h / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-[11px]"
                        style={{ fill: inkVar(si), pointerEvents: "none" }}
                      >
                        {pct(share, 0)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between px-1 text-[10px] text-muted-foreground tabular-nums">
        {months.map((m) => (
          <span key={m} className="flex-1 text-center">
            {monthAxis(m)}
          </span>
        ))}
      </div>

      {/* Легенда обовʼязкова: сім сегментів не можна впізнати за одним
          лише положенням у стовпчику, коли частки міняються місяцями. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {series.map((s, si) => (
          <li
            key={s.label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-[2px] ring-1 ring-border"
              style={{ background: stepVar(si) }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
