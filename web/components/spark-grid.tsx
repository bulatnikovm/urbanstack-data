import { monthLabel, monthTooltip, n, delta } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Малі множини (small multiples): по одному крихітному графіку на категорію,
 * усі — в ОДНОМУ масштабі.
 *
 * ── Чому не один графік із трьома рядами ──────────────────────────────────
 * Раніше тут стояла заливка (`BklitArea`) з трьома категоріями поверх одна
 * одної в монохромі. Найбільша категорія — темна суцільна пляма, і дві інші
 * ховались під нею; ні осі Y (bklit її не малює), ні числа на екрані не було
 * взагалі. «Я цей графік узагалі не розумію» (Микита, 2026-08-28) — і це
 * чесна реакція, а не питання смаку: з картинки не читалось ані скільки
 * заявок, ані котра лінія чия.
 *
 * Малі множини знімають обидві проблеми одразу: ряди не перекриваються за
 * побудовою, а біля кожного стоїть його число за останній місяць і зміна до
 * попереднього. Бонус — зникає ліміт «три кольорові слоти», тож категорій
 * можна показати стільки, скільки їх реально є.
 *
 * ⚠️ Спільний масштаб Y — головна властивість цього блоку, і зламати її
 * легко. Якби кожна клітинка масштабувалась сама по собі, категорія з
 * трьома заявками на місяць виглядала б так само «високо», як категорія з
 * тисячею, і порівняння перетворилось би на обман. Тому максимум рахується
 * ОДИН на всі ряди й підписаний на екрані.
 */

export type SparkSeries = {
  label: string;
  /** Значення в порядку місяців — рівно тієї ж довжини, що `months`. */
  values: number[];
};

/** Розміри системи координат SVG. Реальні пікселі задає CSS. */
const VB = { w: 300, h: 56 };

function path(values: number[], max: number, close: boolean) {
  if (values.length === 0) return "";
  const stepX = values.length > 1 ? VB.w / (values.length - 1) : 0;
  const y = (v: number) => VB.h - (max > 0 ? (v / max) * (VB.h - 2) : 0) - 1;
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" ");
  return close
    ? `${line} L${VB.w} ${VB.h} L0 ${VB.h} Z`
    : line;
}

export function SparkGrid({
  months,
  series,
  className,
}: {
  /** Ключі місяців за зростанням — спільна вісь X для всіх клітинок. */
  months: string[];
  series: SparkSeries[];
  className?: string;
}) {
  if (months.length === 0 || series.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-muted-foreground">
        За вибраний період даних немає.
      </p>
    );
  }

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const last = months.length - 1;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {series.map((s) => {
          const cur = s.values[last] ?? 0;
          const prev = s.values[last - 1] ?? 0;
          return (
            <div
              key={s.label}
              className="flex flex-col gap-1.5 rounded-lg border p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium" title={s.label}>
                  {s.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-sm font-semibold tabular-nums">
                    {n(cur)}
                  </span>
                  {months.length > 1 && (
                    <span
                      className="text-[10px] tabular-nums text-muted-foreground"
                      title={`Зміна до ${monthLabel(months[last - 1])}`}
                    >
                      {delta(cur / Math.max(prev, 1) - 1)}
                    </span>
                  )}
                </span>
              </div>

              <svg
                viewBox={`0 0 ${VB.w} ${VB.h}`}
                preserveAspectRatio="none"
                className="h-14 w-full"
                role="img"
                aria-label={`${s.label}: ${n(cur)} за ${monthLabel(months[last])}`}
              >
                {/*
                  `vector-effect` обовʼязковий: `preserveAspectRatio="none"`
                  розтягує систему координат по ширині нерівномірно, і без
                  нього лінія стала б вертикально тонкою, а горизонтально
                  жирною.
                */}
                <path d={path(s.values, max, true)} fill="var(--chart-1)" opacity={0.35} />
                <path
                  d={path(s.values, max, false)}
                  fill="none"
                  stroke="var(--chart-3)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Прозорі смуги з нативним тултипом: значення конкретного
                    місяця можна дістати наведенням, не малюючи осі Y. */}
                {months.map((m, i) => (
                  <rect
                    key={m}
                    x={(i * VB.w) / months.length}
                    y={0}
                    width={VB.w / months.length}
                    height={VB.h}
                    fill="transparent"
                  >
                    <title>{`${monthTooltip(m)} · ${n(s.values[i] ?? 0)}`}</title>
                  </rect>
                ))}
              </svg>

              {/* Тільки кінці осі X. Проміжні підписи в клітинку 280
                  пікселів завширшки не влазять, а значення конкретного
                  місяця дістається наведенням на графік. */}
              <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>{monthLabel(months[0])}</span>
                <span>{monthLabel(months[last])}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        Усі графіки в одному масштабі — верх клітинки це{" "}
        <span className="font-medium tabular-nums">{n(max)}</span> заявок за
        місяць, найбільше значення по всіх категоріях періоду. Тому висоту
        можна порівнювати між клітинками, а не лише всередині однієї.
      </p>
    </div>
  );
}
