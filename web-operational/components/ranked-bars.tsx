import { n, n1, pct } from "@/lib/format";

/**
 * Рейтинг (модулі, STAR-категорії) — чистий HTML/CSS, без Recharts.
 *
 * Чому не графічна бібліотека: це список «підпис — смуга — значення», і
 * розмітка робить його краще за SVG. Значення й назви завжди видно (не
 * ховаються за наведенням), сортування читається згори вниз, нуль
 * клієнтського JS — компонент серверний. Плюс не залежимо від того, які
 * саме підкомпоненти Recharts доїжджають у браузерний бандл.
 *
 * Одна серія → один колір: перші `highlightTop` позицій темніші, решта —
 * світліший крок того ж синього. Ранг несе положення, колір лише підкреслює.
 */

type Fmt = "int" | "pct" | "num";

const fmt = (v: number, k: Fmt) =>
  k === "pct" ? pct(v) : k === "num" ? n1(v) : n(v);

export function RankedBars({
  data,
  kind = "pct",
  highlightTop = 3,
}: {
  data: Array<{ label: string; value: number }>;
  kind?: Fmt;
  highlightTop?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <ol className="flex flex-col gap-2 px-2 py-1">
      {data.map((d, i) => (
        <li key={d.label} className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-3">
          <span className="truncate text-[11px] text-muted-foreground" title={d.label}>
            {d.label}
          </span>
          <span className="h-4 w-full overflow-hidden rounded-[3px] bg-muted/60">
            <span
              className="block h-full rounded-[3px]"
              style={{
                width: max > 0 ? `${Math.max((d.value / max) * 100, 1.5)}%` : "0%",
                background:
                  i < highlightTop ? "var(--seq-400)" : "var(--seq-250)",
              }}
            />
          </span>
          <span className="text-right text-[11px] font-medium tabular-nums">
            {fmt(d.value, kind)}
          </span>
        </li>
      ))}
    </ol>
  );
}
