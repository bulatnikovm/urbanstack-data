"use client";

import { Tooltip } from "@base-ui/react/tooltip";

import { delta, monthLabel, n, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Динаміка однієї STAR-категорії по місяцях: при наведенні на назву
 * категорії — скільки користувачів і яка частка бази щомісяця, а не тільки
 * знімок поточного місяця (ANA-25, Артем — Микита не пам'ятав точне
 * формулювання, тому зміст картки обраний як найбільш самодостатнє
 * тлумачення «розказати більше про категорію»).
 *
 * Найближчий родич — `CellBreakdown` (розклад клітинки зведеної по ЖК,
 * ANA-20): та сама механіка підказки Base UI, тут розклад не по категоріях
 * усередині місяця, а по місяцях усередині ОДНІЄЇ категорії.
 */

export type CategoryTrendRow = {
  monthKey: string;
  users: number;
  rate: number;
  momChangePct: number | null;
};

export type CategoryTrendData = {
  category: string;
  rows: CategoryTrendRow[];
};

export function CategoryTrend({
  data,
  children,
  className,
}: {
  data: CategoryTrendData;
  children: React.ReactNode;
  className?: string;
}) {
  // Найновіший місяць зверху — так само, як «Категорії в деталях» показує
  // поточний місяць першим.
  const rows = [...data.rows].reverse();

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
        <Tooltip.Positioner
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="isolate z-50"
        >
          <Tooltip.Popup className="w-[280px] origin-(--transform-origin) rounded-lg border bg-popover p-0 text-popover-foreground shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex flex-col gap-0.5 border-b px-3 py-2">
              <span className="text-xs font-medium">{data.category}</span>
              <span className="text-[11px] text-muted-foreground">
                Динаміка по місяцях
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-foreground">
                Немає даних за цей період.
              </p>
            ) : (
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-muted-foreground [&_th]:px-3 [&_th]:py-1 [&_th]:font-normal">
                    <th className="text-left">Місяць</th>
                    <th className="text-right !px-1.5">Користувачів</th>
                    <th className="text-right !px-1.5">% бази</th>
                    <th className="text-right">Δ м/м</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.monthKey}
                      className="border-t border-border/40 [&_td]:px-3 [&_td]:py-1"
                    >
                      <td className="text-left">{monthLabel(r.monthKey)}</td>
                      <td className="text-right !px-1.5">{n(r.users)}</td>
                      <td className="text-right !px-1.5 text-muted-foreground">
                        {pct(r.rate)}
                      </td>
                      <td
                        className="text-right"
                        style={{
                          color:
                            r.momChangePct == null
                              ? undefined
                              : r.momChangePct >= 0
                                ? "var(--status-good)"
                                : "var(--status-critical)",
                        }}
                      >
                        {r.momChangePct == null ? "—" : delta(r.momChangePct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
