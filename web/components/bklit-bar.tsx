"use client";

import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { n, n1, pct, uah } from "@/lib/format";
import type { Series } from "./bklit-line";

type Fmt = "int" | "pct" | "num" | "money";

const fmt = (v: number, k: Fmt) =>
  k === "pct" ? pct(v) : k === "num" ? n1(v) : k === "money" ? uah(v) : n(v);

/**
 * Стовпчики на Bklit UI. Заміна `StackedBars`.
 *
 * `stacked=false` (дефолт) — серії поруч, для «декілька окремих метрик за
 * місяць». `stacked=true` — одна на одній, для композиції частин цілого
 * (напр. «активовані + не активувались = усі нові користувачі», де важлива
 * саме висота стовпчика як тотал).
 *
 * Кольори, вісь, легенда, локаль тултипа — той самий підхід, що й у
 * `BklitLine` (див. коментар там). НЕ чіпати кольори без нового рішення
 * Микити — монохром навмисний.
 */
export function BklitBar({
  data,
  series,
  kind = "int",
  xKey = "month",
  stacked = false,
  aspectRatio = "2 / 1",
  className = "w-full",
}: {
  data: Array<Record<string, string | number>>;
  series: Series[];
  kind?: Fmt;
  xKey?: string;
  stacked?: boolean;
  /** "ширина / висота" — задавай тут, не через Tailwind `aspect-[…]` у
   * className (inline style компонента завжди перебиває клас). */
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <BarChart
        data={data}
        xDataKey={xKey}
        stacked={stacked}
        aspectRatio={aspectRatio}
        className={className}
        margin={{ top: 24, right: 12, bottom: 28, left: 12 }}
        barGap={0.3}
      >
        <Grid horizontal fadeHorizontal={false} />
        <BarXAxis />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--chart-${s.slot})`} />
        ))}
        <ChartTooltip
          rows={(point) =>
            series.map((s) => ({
              color: `var(--chart-${s.slot})`,
              label: s.label,
              value: fmt(Number(point[s.key] ?? 0), kind),
            }))
          }
        />
      </BarChart>

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
