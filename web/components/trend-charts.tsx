"use client";

/**
 * Графіки на shadcn <ChartContainer> (Recharts під капотом).
 *
 * Правила з dataviz-довідника, яких тут дотримуємось:
 *  · максимум 3 категоріальні серії — 4-та згортається в "Інше" або йде
 *    окремим графіком; кольори НЕ циклимо;
 *  · жодних двох осей Y — дві різні шкали означають два графіки;
 *  · легенда при ≥2 серіях (ідентичність не тримається лише на кольорі);
 *  · тонкі марки, приглушена сітка, тултип скрізь.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { monthShort, monthTooltip, n, n1, pct } from "@/lib/format";

export type Series = { key: string; label: string; slot: 1 | 2 | 3 };
type Fmt = "int" | "pct" | "num";

const fmt = (v: number, k: Fmt) =>
  k === "pct" ? pct(v) : k === "num" ? n1(v) : n(v);

const axisTick = { fontSize: 11 };

function toConfig(series: Series[]): ChartConfig {
  return Object.fromEntries(
    series.map((s) => [
      s.key,
      { label: s.label, color: `var(--series-${s.slot})` },
    ])
  );
}

/**
 * Форматує лише значення. НЕ використовуємо штатний `formatter` shadcn —
 * він підміняє рядок тултипа цілком, і назви серій зникають; лишається
 * стовпчик чисел без підписів. Тому в chart.tsx доданий `valueFormatter`.
 */
const valueFormatter = (kind: Fmt) => (value: unknown) =>
  typeof value === "number" ? fmt(value, kind) : String(value ?? "");

// ── Лінії в часі ────────────────────────────────────────────────────────

export function TrendLines({
  data,
  series,
  kind = "int",
  className = "aspect-[2/1] w-full",
}: {
  data: Array<Record<string, string | number>>;
  series: Series[];
  kind?: Fmt;
  className?: string;
}) {
  return (
    <ChartContainer config={toConfig(series)} className={className}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={monthShort}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={48}
          tickFormatter={(v) => (kind === "pct" ? pct(v, 0) : n(v))}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              labelFormatter={(l) => monthTooltip(String(l))}
              valueFormatter={valueFormatter(kind)}
            />
          }
        />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

// ── Площі з градієнтом (герой-графік) ───────────────────────────────────

export function TrendAreas({
  data,
  series,
  kind = "int",
  className = "aspect-[3/1] w-full",
}: {
  data: Array<Record<string, string | number>>;
  series: Series[];
  kind?: Fmt;
  className?: string;
}) {
  return (
    <ChartContainer config={toConfig(series)} className={className}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`fill-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor={`var(--color-${s.key})`}
                stopOpacity={0.03}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={monthShort}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={48}
          tickFormatter={(v) => (kind === "pct" ? pct(v, 0) : n(v))}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              labelFormatter={(l) => monthTooltip(String(l))}
              valueFormatter={valueFormatter(kind)}
            />
          }
        />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            fill={`url(#fill-${s.key})`}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

// ── Складені стовпчики ──────────────────────────────────────────────────

export function StackedBars({
  data,
  series,
  className = "aspect-[2/1] w-full",
}: {
  data: Array<Record<string, string | number>>;
  series: Series[];
  className?: string;
}) {
  return (
    <ChartContainer config={toConfig(series)} className={className}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={monthShort}
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={20}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={48}
          tickFormatter={(v) => n(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(l) => monthTooltip(String(l))}
              valueFormatter={valueFormatter("int")}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="a"
            fill={`var(--color-${s.key})`}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ── Пончик (розподіл: OS, статус версії) ────────────────────────────────
// Одна вимірність, ≤3 сегменти. Більше — це рейтинг, а не пончик.

export function DonutChart({
  data,
  className = "mx-auto aspect-square w-full max-w-[240px]",
}: {
  data: Array<{ label: string; value: number }>;
  className?: string;
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.label,
      { label: d.label, color: `var(--series-${(i % 3) + 1})` },
    ])
  );
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <ChartContainer config={config} className={className}>
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              nameKey="label"
              valueFormatter={(v) =>
                typeof v === "number"
                  ? `${n(v)} · ${pct(total ? v / total : 0, 0)}`
                  : String(v)
              }
            />
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="58%"
          outerRadius="86%"
          paddingAngle={2}
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={d.label} fill={`var(--series-${(i % 3) + 1})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="label" />} />
      </PieChart>
    </ChartContainer>
  );
}
