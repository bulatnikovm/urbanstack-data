"use client";

import { Grid } from "@/components/charts/grid";
import { Line, LineChart } from "@/components/charts/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { n, n1, pct, uah } from "@/lib/format";

export type Series = { key: string; label: string; slot: 1 | 2 | 3 };
type Fmt = "int" | "pct" | "num" | "money";

const fmt = (v: number, k: Fmt) =>
  k === "pct" ? pct(v) : k === "num" ? n1(v) : k === "money" ? uah(v) : n(v);

/**
 * Лінії на Bklit UI. Заміна `TrendLines` (shadcn/Recharts) — та сама роль
 * (лінії в часі), інший рушій.
 *
 * Кольори — `--chart-1/2/3` (сірий градієнт скафолду), НЕ наші валідовані
 * CVD-слоти `--series-N` і не брендові пастелі. Рішення Микити (2026-08-06,
 * за скріном демо bklit.com): дефолтний вигляд bklit — монохромний, і саме
 * це "той самий вигляд", який він хотів. Якщо колись знадобляться кольорові
 * лінії — see `--series-N` у globals.css, вони вже CVD-перевірені.
 *
 * ⚠️ Bklit-версія осі не показує числа на Y — тільки горизонтальні
 * gridlines (так само в оригінальному демо). Значення — лише через тултип
 * на hover. Свідомий компроміс мінімалізму bklit, не баг.
 */
export function BklitLine({
  data,
  series,
  kind = "int",
  xKey = "month",
  aspectRatio = "2 / 1",
  className = "w-full",
}: {
  data: Array<Record<string, string | number>>;
  series: Series[];
  kind?: Fmt;
  xKey?: string;
  /** "ширина / висота", напр. "3 / 1". ⚠️ Не задавай через Tailwind
   * `aspect-[…]` у className — LineChart сам ставить inline
   * `style.aspectRatio`, і inline завжди перебиває клас (перевірено
   * 2026-08-06: клас показував 3/1, реально малювалось 2/1). */
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <LineChart
        data={data}
        xDataKey={xKey}
        aspectRatio={aspectRatio}
        className={className}
        margin={{ top: 24, right: 12, bottom: 28, left: 12 }}
      >
        <Grid horizontal fadeHorizontal={false} />
        <XAxis />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            stroke={`var(--chart-${s.slot})`}
          />
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
      </LineChart>

      {/* Bklit не має вбудованої легенди (на відміну від shadcn ChartLegend
          у TrendLines) — без неї дві сірі лінії різної яскравості
          невідрізнимі без наведення. Той самий прийом, що й BklitDonut. */}
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1">
          {series.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="size-2 shrink-0 rounded-full"
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
