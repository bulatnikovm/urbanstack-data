"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useState } from "react";

import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { usePieHover, usePieStable } from "@/components/charts/pie-context";
import { n, pct } from "@/lib/format";

/**
 * Заміна bklit `<PieCenter>` — та сама поведінка (тотал у спокої, значення
 * сегмента на hover), але БЕЗ `NumberFlow`.
 *
 * `PieChart` розпізнає центральний елемент по імені функції ("PieCenter"),
 * не по референсу — див. `isPieCenter()` у `pie-chart.tsx`. Тому власна
 * функція з такою ж назвою підхоплюється в той самий grid-слот автоматично.
 *
 * Причина: `ChartStatFlow` (bklit, `chart-stat-flow.tsx`) вирішує рендерити
 * статичний текст чи `<NumberFlow>` через
 * `useState(() => customElements.get("number-flow-react"))`. На сервері
 * `customElements` не існує → `false` → статичний текст. У браузері під час
 * ПЕРШОГО рендеру (гідратації) custom element вже зареєстрований синхронно
 * при імпорті модуля → `true` → `<NumberFlow>`. Два різні дерева на
 * гідратації — React кидає "Hydration failed", підтверджено в консолі
 * (розбіжність саме на цьому центральному числі).
 */
function PieCenter({ label, boxSize }: { label: string; boxSize: number }) {
  const { data, totalValue } = usePieStable();
  const { hoveredIndex } = usePieHover();
  const hovered = hoveredIndex === null ? null : data[hoveredIndex];
  const value = hovered ? hovered.value : totalValue;

  // `mounted` — той самий прийом, що й у ThemeToggle. NumberFlow реєструє
  // custom element при імпорті модуля, тож на СЕРВЕРІ його немає, а в
  // браузері під час гідратації вже є — два різні дерева, "Hydration
  // failed" (саме через це анімацію тут раніше й прибрали). Тепер перший
  // клієнтський рендер збігається з серверним (обидва — статичний текст),
  // і лише наступним рендером зʼявляється анімоване число.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ width: boxSize, height: boxSize }}
    >
      <span className="text-2xl font-bold tabular-nums text-foreground">
        {mounted ? (
          <NumberFlow value={value} locales="uk-UA" />
        ) : (
          n(value)
        )}
      </span>
      <span className="mt-0.5 text-xs text-muted-foreground">
        {hovered ? hovered.label : label}
      </span>
    </div>
  );
}

/**
 * ⚠️ ОБОВʼЯЗКОВО. `isPieCenter()` у pie-chart.tsx шукає центр за
 * `displayName` АБО `name` функції. У dev-збірці рятує `name` ("PieCenter"),
 * але в проді мініфікатор перейменовує функції на однобуквені — `name` стає
 * чимось на кшталт "t", збіг зникає, і центр МОВЧКИ викидається з рендеру
 * (не помилка, не попередження — просто порожня дірка в пончику).
 *
 * Саме так і сталося на першому деплої. Bklit на власному `PieSlice`
 * displayName ставить — тут його бракувало.
 */
PieCenter.displayName = "PieCenter";

/**
 * Пончик на Bklit UI (`@bklit/pie-chart`) — той анімований компонент, який
 * просив Микита, замінює shadcn `DonutChart` для ОС і версій.
 *
 * Bklit сам композиційний (`<PieChart><PieSlice/></PieChart>`, без
 * готового legend/tooltip), тому легенда й підписи — наш HTML поруч, у
 * тому самому стилі, що й решта дашборду (не окрема мова компонентів).
 *
 * Кольори передаються ЯВНО через `--series-N` (наші валідовані слоти з
 * dataviz-довідника), а не дефолтну bklit-палітру `--chart-1..5` — вона не
 * пройшла нашу CVD-перевірку.
 *
 * ⚠️ `size` — ФІКСОВАНИЙ піксельний розмір, не auto-responsive. Bklit без
 * `size` вимірює батьківський контейнер через visx `ParentSize`, а всередині
 * flex-колонки з `items-center` (наш layout — легенда під пончиком) той
 * контейнер ніколи не отримує визначеної ширини: `PieChartInner` має захист
 * `size < 10 → return null`, і пончик мовчки не рендериться взагалі.
 * `innerRadius`/`hoverOffset` тут теж ПІКСЕЛІ, не частка 0–1 (на відміну
 * від shadcn-обгортки, яку ця заміняє) — легко переплутати вдруге.
 */
export function BklitDonut({
  data,
  centerLabel = "Разом",
  size = 200,
}: {
  data: Array<{ label: string; value: number }>;
  centerLabel?: string;
  size?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  // `--chart-N`, не `--series-N`: дашборд монохромний (рішення Микити
  // 2026-08-06), пончик має бути тієї ж сірої шкали, що й лінії.
  const colored = data.slice(0, 3).map((d, i) => ({
    ...d,
    color: `var(--chart-${i + 1})`,
  }));
  const rest = data.slice(3);
  if (rest.length) {
    colored.push({
      label: "Інше",
      value: rest.reduce((a, d) => a + d.value, 0),
      color: "var(--muted-foreground)",
    });
  }

  return (
    // `h-full justify-center` — картка стоїть у grid-ряду поруч із високою
    // таблицею й розтягується під неї; без цього пончик тулився вгору, а
    // під легендою лишалась порожнеча на пів картки.
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <PieChart
        data={colored}
        size={size}
        innerRadius={size * 0.32}
        padAngle={0.02}
        cornerRadius={3}
      >
        {colored.map((_, i) => (
          <PieSlice key={i} index={i} />
        ))}
        <PieCenter label={centerLabel} boxSize={size * 0.32 * 2 - 16} />
      </PieChart>

      <ul className="flex w-full flex-col gap-1.5">
        {colored.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: d.color }}
            />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="ml-auto font-medium tabular-nums">
              {n(d.value)}
            </span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">
              {pct(total ? d.value / total : 0, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
