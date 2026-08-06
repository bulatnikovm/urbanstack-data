"use client";

import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip, TooltipContent } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import type { Series, XUnit } from "./bklit-line";
import { tooltipRows, tooltipTitle } from "./bklit-line";

type Fmt = "int" | "pct" | "num" | "money";

/**
 * Площі з градієнтом на Bklit UI. Заміна `TrendAreas` (герой-графіки) —
 * той самий `TimeSeriesChartInner`, що й у BklitLine, тому Grid/XAxis/
 * ChartTooltip ті самі компоненти, просто з `<Area>` замість `<Line>`.
 *
 * Кольори — `--chart-N`, монохром, той самий підхід, що й в інших Bklit-
 * обгортках (див. коментар у bklit-line.tsx).
 */
export function BklitArea({
  data,
  series,
  kind = "int",
  xKey = "month",
  xUnit = "month",
  aspectRatio = "3 / 1",
  className = "w-full",
}: {
  data: Array<Record<string, string | number>>;
  series: Series[];
  kind?: Fmt;
  xKey?: string;
  xUnit?: XUnit;
  /** "ширина / висота" — задавай тут, не через Tailwind `aspect-[…]` у
   * className (inline style компонента завжди перебиває клас). */
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <AreaChart
        data={data}
        xDataKey={xKey}
        aspectRatio={aspectRatio}
        className={className}
        margin={{ top: 24, right: 12, bottom: 28, left: 12 }}
      >
        <Grid horizontal fadeHorizontal={false} />
        <XAxis />
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            fill={`var(--chart-${s.slot})`}
            stroke={`var(--chart-${s.slot})`}
          />
        ))}
        <ChartTooltip
          content={({ point }) => (
            <TooltipContent
              title={tooltipTitle(String(point[xKey] ?? ""), xUnit)}
              rows={tooltipRows(point, series, kind)}
            />
          )}
        />
      </AreaChart>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1">
          {series.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: `var(--chart-${s.slot})` }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
