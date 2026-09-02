"use client";

import { useState } from "react";

import { monthAxis, monthLabel, n, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Стовпчики на 100%: із чого складається місяць.
 *
 * ── Чому власний компонент, а не BklitBar ────────────────────────────────
 * `BklitBar` навмисно ставить серії ПОРУЧ: скруглення там робиться через
 * `rx` на `<rect>`, а він заокруглює всі чотири кути, і в стеку це давало
 * артефакт (див. коментар у самому BklitBar). Тут стек — суть блоку.
 *
 * ── Чому HTML, а не SVG ──────────────────────────────────────────────────
 * Перша версія малювалась в SVG з viewBox 1000×300, і підписи виходили
 * дрібними: текст усередині SVG масштабується разом із системою координат,
 * тож 11px перетворювались на 7-8 реальних. У HTML сегмент — це div з
 * висотою у відсотках, а підпис лишається справжнім текстом потрібного
 * розміру.
 *
 * ── Кольори ──────────────────────────────────────────────────────────────
 * Сім відтінків ОДНОГО кольору, від темного до світлого — токени `--ramp-*`
 * у globals.css, там же історія трьох спроб і ціна цього вибору.
 *
 * ⚠️ Колір закріплений за КАТЕГОРІЄЮ через її позицію в наборі, а не за її
 * розміром. Пересортуєш серії за величиною — кольори поїдуть місяць у
 * місяць, а графік перестане читатись.
 *
 * ⚠️ На шкалі одного тону сусідні кроки розрізняються слабше, ніж різні
 * кольори. Тому identity тримається не на кольорі: легенда, підписи прямо
 * на сегментах, підказка з усіма категоріями і вигрузка в Excel.
 */

export type ShareSeries = {
  label: string;
  /** Значення в порядку місяців — рівно тієї ж довжини, що `months`. */
  values: number[];
};

/** Скільки максимум кроків має палітра — стільки ж токенів у globals.css. */
const SLOTS = 7;

/** З якої частки сегмент отримує підпис прямо на собі. */
const LABEL_FROM = 0.035;

const fill = (i: number) => `var(--ramp-${Math.min(i + 1, SLOTS)})`;
const ink = (i: number) => `var(--ramp-fg-${Math.min(i + 1, SLOTS)})`;

const GRID = [100, 80, 60, 40, 20, 0];

export function StackedShare({
  months,
  series,
  partialMonth,
  className,
}: {
  /** Ключі місяців за зростанням — вісь X. */
  months: string[];
  /** Серії у ФІКСОВАНОМУ порядку категорій — він і задає колір. */
  series: ShareSeries[];
  /**
   * Місяць, який ще триває. Його стовпчик штрихується: частки в перші дні
   * місяця стрибають (у вересня 2026 на другий день СКД займала 77%), і
   * без позначки такий стовпчик читається як повноцінний результат.
   */
  partialMonth?: string | null;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (months.length === 0 || series.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        За вибраний період даних немає.
      </p>
    );
  }

  const totals = months.map((_, i) =>
    series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0)
  );
  const shareAt = (si: number, mi: number) =>
    totals[mi] > 0 ? (series[si].values[mi] ?? 0) / totals[mi] : 0;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Легенда згори — так само, як в оригінальному звіті: людина читає
          набір категорій ДО того, як почне розбирати стовпчики. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s, si) => (
          <li
            key={s.label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: fill(si) }}
            />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="relative flex gap-2">
        {/* Вісь Y. Її не було в першій версії, і без неї стовпчик на 100%
            читався як «щось кольорове»: очі нема за що зачепити, коли
            підпис стоїть не на кожному сегменті. */}
        <div className="relative h-[280px] w-8 shrink-0">
          {GRID.map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ top: `${100 - v}%` }}
            >
              {v}%
            </span>
          ))}
        </div>

        <div className="relative h-[280px] flex-1">
          {GRID.map((v) => (
            <span
              key={v}
              className="absolute right-0 left-0 border-t border-[var(--grid-line)]"
              style={{ top: `${100 - v}%` }}
            />
          ))}

          <div className="absolute inset-0 flex gap-1">
            {months.map((month, mi) => (
              <div
                key={month}
                // Скруглення на СТОВПЧИКУ, а не на сегментах: `overflow-hidden`
                // зрізає кути всієї стопки, тож заокруглюються лише її верх і
                // низ. Скруглити кожен сегмент окремо неможливо — вийшов би
                // той самий артефакт, через який BklitBar узагалі відмовився
                // від стека: капсула з круглим низом над сусідом.
                className="relative flex flex-1 flex-col-reverse overflow-hidden rounded-md"
                onMouseEnter={() => setHover(mi)}
                onMouseLeave={() => setHover(null)}
              >
                {month === partialMonth && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-10"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, transparent 0 5px, var(--card) 5px 6.5px)",
                      opacity: 0.75,
                    }}
                  />
                )}
                {series.map((s, si) => {
                  const share = shareAt(si, mi);
                  if (share <= 0) return null;
                  return (
                    <div
                      key={s.label}
                      className={cn(
                        "flex items-center justify-center overflow-hidden transition-opacity",
                        // Наведення гасить сусідні МІСЯЦІ, а не сусідні
                        // категорії: порівнюють саме місяці, і підсвітка
                        // всередині стовпчика тільки заважала б читати склад.
                        hover !== null && hover !== mi && "opacity-45"
                      )}
                      style={{
                        height: `${share * 100}%`,
                        background: fill(si),
                        // Просвіт — рамкою в колір підкладки, а не відступом:
                        // відступ забрав би висоту, і сума сегментів
                        // перестала б дорівнювати 100%.
                        boxShadow: "inset 0 -1.5px 0 0 var(--card)",
                      }}
                    >
                      {share >= LABEL_FROM && (
                        <span
                          className="text-[10px] leading-none font-medium tabular-nums"
                          style={{ color: ink(si) }}
                        >
                          {pct(share, share < 0.1 ? 1 : 0)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {hover !== null && (
            <Card
              months={months}
              series={series}
              partialMonth={partialMonth}
              mi={hover}
              total={totals[hover]}
              shareAt={shareAt}
              /** Праворуч від курсора, поки не впираємось у правий край. */
              side={hover > months.length / 2 ? "right" : "left"}
              at={((hover + 0.5) / months.length) * 100}
            />
          )}
        </div>
      </div>

      <div className="flex gap-1 pl-10">
        {months.map((m, mi) => (
          <span
            key={m}
            className={cn(
              "flex-1 text-center text-[10px] tabular-nums",
              hover === mi ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {monthAxis(m)}
            {m === partialMonth && (
              <span title="місяць ще триває"> ·</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Підказка показує ВЕСЬ місяць, а не той сегмент, під яким курсор.
 *
 * Питання до цього графіка — «з чого складається місяць», і відповідь на
 * нього не може бути одним рядком. Плюс дрібні категорії (1-2%) неможливо
 * впіймати курсором, і саме вони найчастіше цікаві.
 */
function Card({
  months,
  series,
  partialMonth,
  mi,
  total,
  shareAt,
  side,
  at,
}: {
  months: string[];
  series: ShareSeries[];
  partialMonth?: string | null;
  mi: number;
  total: number;
  shareAt: (si: number, mi: number) => number;
  side: "left" | "right";
  at: number;
}) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 w-[232px] rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
      style={
        side === "left"
          ? { left: `calc(${at}% + 10px)` }
          : { right: `calc(${100 - at}% + 10px)` }
      }
    >
      <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
        <span className="text-xs font-medium">
          {monthLabel(months[mi])}
          {months[mi] === partialMonth && (
            <span className="ml-1 font-normal text-muted-foreground">
              (триває)
            </span>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {n(total)} дій
        </span>
      </div>
      <table className="w-full text-[11px] tabular-nums">
        <tbody>
          {series.map((s, si) => {
            const share = shareAt(si, mi);
            return (
              <tr key={s.label} className={share > 0 ? "" : "opacity-40"}>
                <td className="py-[1px] pr-1.5 pl-1">
                  <span
                    className="inline-block size-2 rounded-[2px] align-middle"
                    style={{ background: fill(si) }}
                  />
                </td>
                <td className="w-full py-[1px] pr-2 text-left">{s.label}</td>
                <td className="py-[1px] pr-2 text-right text-muted-foreground">
                  {n(s.values[mi] ?? 0)}
                </td>
                <td className="py-[1px] pr-1 text-right font-medium">
                  {pct(share, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
