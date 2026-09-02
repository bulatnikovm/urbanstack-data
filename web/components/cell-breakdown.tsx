"use client";

import { Tooltip } from "@base-ui/react/tooltip";

import { monthLabel, n, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Розклад клітинки зведеної по ЖК: що саме за цими заявками.
 *
 * Прохання Максима (ANA-20, 2026-09-01): «чи реально додати при наведенні
 * курсору на ЖК розширену інформацію по заявках — місяць в місяць, зріз по
 * різним категоріям, по абсолютним значенням та відсоткам». Три ці розрізи
 * і є вміст картки: категорія, скільки заявок, яку частку місяця вона
 * займає і як змінилась до попереднього місяця.
 *
 * ── Чому підказка, а не ще одна колонка ──────────────────────────────────
 * Категорій п'ятнадцять, місяців у зведеній тринадцять. Розгорнути це в
 * таблицю означає 195 колонок, у які ніхто не дивитиметься; а обрати «топ-3»
 * означає вирішити за операційку, які категорії їй важливі. Підказка показує
 * ВСІ категорії, але тільки для того ЖК і того місяця, куди дивиться людина.
 *
 * ⚠️ Розкладається саме «Всього» (створені за місяць) — єдиний показник, що
 * ділиться на категорії без залишку. «Виконано» й «Відхилено» рахуються по
 * ДАТІ ЗАКРИТТЯ, тобто їхні категорії належать іншому набору заявок, і сума
 * по категоріях не зійшлась би з числом у клітинці.
 */

export type BreakdownRow = {
  label: string;
  /** Заявки цього місяця. */
  cur: number;
  /** Той самий зріз місяцем раніше — для колонки «Δ м/м». */
  prev: number;
};

export type Breakdown = {
  complexName: string;
  monthKey: string;
  /** Попередній календарний місяць; `null`, якщо його немає в даних. */
  prevMonthKey: string | null;
  total: number;
  prevTotal: number;
  rows: BreakdownRow[];
};

/** Δ показуємо тільки коли є з чим порівнювати — інакше «+12» бреше. */
const diff = (row: BreakdownRow, hasPrev: boolean) =>
  hasPrev ? row.cur - row.prev : null;

/**
 * Знакове ціле: «+12», «−5», «0».
 *
 * `delta` з lib/format тут не годиться — вона форматує ЧАСТКУ у відсотки
 * («+12%»), а тут різниця в штуках.
 *
 * Кольором різниця НЕ фарбується. Спокуса пофарбувати зростання червоним є,
 * але «більше заявок» не означає «гірше»: сплеск у категорії може бути і
 * аварією, і тим, що люди нарешті почали писати. Дашборд показує напрямок,
 * висновок робить операційка.
 */
const signed = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${n(Math.abs(v))}`);

/**
 * Спільний таймер відкриття для всіх карток однієї таблиці.
 *
 * Провайдер ОДИН на таблицю, а не по одному на клітинку. Це не лише економія
 * (у зведеній 10 ЖК × 13 місяців анкерів під дві сотні): провайдер існує саме
 * для того, щоб група підказок ділила один таймер — тоді перехід між
 * сусідніми клітинками показує наступну картку одразу, а не змушує чекати
 * повну затримку заново. З провайдером на кожній клітинці такої поведінки
 * немає за побудовою.
 */
export function CellBreakdownProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Provider delay={180} closeDelay={80}>
      {children}
    </Tooltip.Provider>
  );
}

export function CellBreakdown({
  data,
  children,
  className,
}: {
  data: Breakdown;
  children: React.ReactNode;
  className?: string;
}) {
  const hasPrev = data.prevMonthKey !== null;
  const rows = data.rows.filter((r) => r.cur > 0 || (hasPrev && r.prev > 0));
  const totalDiff = hasPrev ? data.total - data.prevTotal : null;

  return (
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <span
              className={cn(
                "cursor-help underline decoration-muted-foreground/50 decoration-dotted underline-offset-4",
                className
              )}
            />
          }
        >
          {children}
        </Tooltip.Trigger>

        <Tooltip.Portal>
          {/* Збоку, а не зверху: рядки зведеної стоять під липкою шапкою
              сторінки, і картка над верхніми рядками ховалась би за нею —
              перевірено, у «Правого берега» вона зрізалась наполовину.
              collisionPadding лишає повітря на випадок, коли Base UI
              перевертає її на протилежний бік біля краю екрана. */}
          <Tooltip.Positioner
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={12}
            className="isolate z-50"
          >
            <Tooltip.Popup className="w-[320px] origin-(--transform-origin) rounded-lg border bg-popover p-0 text-popover-foreground shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <div className="flex flex-col gap-0.5 border-b px-3 py-2">
                <span className="text-xs font-medium">
                  {data.complexName} · {monthLabel(data.monthKey)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Створено {n(data.total)}
                  {totalDiff !== null && (
                    <>
                      {" · "}
                      {signed(totalDiff)} до {monthLabel(data.prevMonthKey!)}
                    </>
                  )}
                </span>
              </div>

              {rows.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-muted-foreground">
                  За цей місяць заявок немає.
                </p>
              ) : (
                <table className="w-full text-[11px] tabular-nums">
                  <thead>
                    <tr className="text-muted-foreground [&_th]:px-3 [&_th]:py-1 [&_th]:font-normal">
                      <th className="text-left">Категорія</th>
                      <th className="text-right !px-1.5">К-сть</th>
                      <th className="text-right !px-1.5">Частка</th>
                      {hasPrev && <th className="text-right">Δ м/м</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const d = diff(r, hasPrev);
                      return (
                        <tr
                          key={r.label}
                          className="border-t border-border/40 [&_td]:px-3 [&_td]:py-1"
                        >
                          <td className="max-w-[150px] truncate text-left">
                            {r.label}
                          </td>
                          <td className="text-right !px-1.5">{n(r.cur)}</td>
                          <td className="text-right !px-1.5 text-muted-foreground">
                            {data.total > 0 ? pct(r.cur / data.total, 0) : "—"}
                          </td>
                          {hasPrev && (
                            <td
                              className={cn(
                                "text-right",
                                d ? "" : "text-muted-foreground"
                              )}
                            >
                              {d === null ? "—" : signed(d)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
  );
}
