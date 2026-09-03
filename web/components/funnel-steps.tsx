import { n, pct } from "@/lib/format";

/**
 * Сквозна воронка — підпис, смуга, абсолют і дві частки.
 *
 * Чистий HTML/CSS без графічної бібліотеки, як RankedBars: це список кроків,
 * і розмітка робить його краще за SVG (значення завжди видно, компонент
 * серверний, нуль клієнтського JS).
 *
 * Показуємо ОБИДВІ частки — від попереднього кроку й від бази, — бо
 * відповідають вони на різні питання. «44% не доходять до реєстрації» — це
 * про крок; «до цільової дії доходить 12%» — про продукт цілком. Одна без
 * одної дає половину картини: крок може виглядати добре при катастрофічному
 * наскрізному результаті.
 */
export function FunnelSteps({
  steps,
}: {
  steps: Array<{ label: string; value: number; hint?: string }>;
}) {
  const base = steps[0]?.value ?? 0;

  return (
    <ol className="flex flex-col gap-2.5 px-2 py-1">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const share = base > 0 ? s.value / base : 0;
        return (
          <li key={s.label} className="flex flex-col gap-1">
            <div className="grid grid-cols-[11rem_1fr_5.5rem] items-center gap-3">
              <span className="truncate text-[11px] text-muted-foreground" title={s.label}>
                {s.label}
              </span>
              <span className="h-5 w-full overflow-hidden rounded-[3px] bg-muted/60">
                <span
                  className="block h-full rounded-[3px]"
                  style={{
                    width: `${Math.max(share * 100, 1.5)}%`,
                    background: i === 0 ? "var(--seq-400)" : "var(--seq-350)",
                  }}
                />
              </span>
              <span className="text-right text-xs font-medium tabular-nums">
                {n(s.value)}
              </span>
            </div>
            <div className="grid grid-cols-[11rem_1fr] gap-3">
              <span />
              <span className="text-[10.5px] text-muted-foreground tabular-nums">
                {prev !== null && prev > 0 && (
                  <>
                    {pct(s.value / prev)} від попереднього · {pct(share)} від бази
                  </>
                )}
                {prev !== null && prev > 0 && s.hint && " · "}
                {s.hint}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
