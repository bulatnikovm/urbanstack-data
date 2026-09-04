import { n, pct } from "@/lib/format";

/**
 * Воронка «перетічними стрічками» — та, що на макеті Bklit.
 *
 * Чистий SVG у серверному рендері, як `ranked-bars.tsx`: нуль клієнтського
 * JS, значення завжди видно (не ховаються за наведенням), у бандл нічого не
 * додається. ⚠️ `bklit` — не пакет: усі `bklit-*` компоненти в цьому репо
 * написані руками, тож і цей теж свій.
 *
 * ── Що показує ───────────────────────────────────────────────────────────
 * Товщина стрічки пропорційна значенню кроку, стрічка центрована по
 * вертикалі й перетікає в наступний крок кубічною кривою. Позаду —
 * приглушений «привид» на всю ширину бази: без нього втрата не видна як
 * ПЛОЩА, і воронка перетворюється на просто спадний графік.
 *
 * ── Дві частки, а не одна ────────────────────────────────────────────────
 * У пігулці — частка від БАЗИ (наскрізна), під підписом — частка від
 * ПОПЕРЕДНЬОГО кроку. Вони відповідають на різні питання, і одна без одної
 * дає половину картини: крок може виглядати добре («втрачаємо лише 10%») при
 * катастрофічному наскрізному результаті. Це рішення переїхало сюди з
 * `funnel-steps.tsx` — той компонент (горизонтальні смуги) цей замінив
 * повністю й видалений, щоб не лишалось двох воронок із розбіжною логікою.
 */

const W = 1000;
const PAD_TOP = 46;
const PAD_BOTTOM = 42;

/**
 * Мінімальна товщина стрічки у координатах SVG.
 *
 * ⚠️ Не косметика. На п'яти кроках хвіст воронки — це одиниці відсотків від
 * бази: 5% від 210px це 10px, а 1% — вже 2px, тобто волосина, яку не видно й
 * не показати. Стрічка, що зникла, читається як «даних немає», хоча дані є.
 * Тому в хвості ми свідомо брешемо про площу на користь того, щоб крок було
 * видно — і саме тому число й відсоток стоять підписами, а не тільки в
 * геометрії.
 */
const MIN_BAND = 7;

type Step = {
  label: string;
  value: number;
  /** Необовʼязкове уточнення в тултипі кроку. */
  hint?: string;
};

/** Кубічна крива між двома точками з горизонтальними дотичними — як у сенкі. */
function link(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function FunnelFlow({
  steps,
  height = 300,
}: {
  steps: Step[];
  height?: number;
}) {
  const base = steps[0]?.value ?? 0;
  if (steps.length === 0 || base <= 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        Даних для воронки немає.
      </p>
    );
  }

  const bandH = height - PAD_TOP - PAD_BOTTOM;
  const cy = PAD_TOP + bandH / 2;

  const cw = W / steps.length;
  // Частка колонки, яку крок стоїть «рівно», перш ніж перетікати далі.
  const flat = cw * 0.44;

  const geo = steps.map((s, i) => {
    const share = s.value / base;
    const t = Math.max(share * bandH, MIN_BAND);
    const x = i * cw;
    return {
      ...s,
      i,
      share,
      x,
      // Останній крок тягнеться до правого краю: інакше під ним лишається
      // порожнє поле в половину колонки, і воронка виглядає обрізаною.
      xEnd: i === steps.length - 1 ? W : x + flat,
      top: cy - t / 2,
      bottom: cy + t / 2,
      prevShare: i > 0 ? safeShare(s.value, steps[i - 1].value) : null,
    };
  });

  const last = geo[geo.length - 1];

  // Верхній край зліва направо, потім нижній — назад. Одна замкнена фігура.
  const top = geo
    .map((g, i) =>
      i === 0
        ? `M ${g.x} ${g.top} L ${g.xEnd} ${g.top}`
        : `${link(geo[i - 1].xEnd, geo[i - 1].top, g.x, g.top)} L ${g.xEnd} ${g.top}`
    )
    .join(" ");

  const bottom = geo
    .slice()
    .reverse()
    .map((g, i, arr) =>
      i === 0
        ? `L ${g.xEnd} ${g.bottom} L ${g.x} ${g.bottom}`
        : `${link(arr[i - 1].x, arr[i - 1].bottom, g.xEnd, g.bottom)} L ${g.x} ${g.bottom}`
    )
    .join(" ");

  return (
    <div className="w-full overflow-x-auto px-1 py-1">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Воронка: ${steps.map((s) => `${s.label} ${n(s.value)}`).join(", ")}`}
        style={{ minWidth: Math.max(steps.length * 130, 420) }}
      >
        {/* Привид бази — щоб втрата читалась як площа, а не тільки як спад. */}
        <rect
          x={0}
          y={cy - bandH / 2}
          width={last.xEnd}
          height={bandH}
          fill="var(--seq-250)"
          opacity={0.16}
          rx={2}
        />

        <path d={`${top} ${bottom} Z`} fill="var(--seq-400)" opacity={0.9} />

        {geo.map((g) => (
          <g key={g.label}>
            <title>
              {`${g.label}: ${n(g.value)} (${pct(g.share)} від першого кроку` +
                (g.prevShare != null
                  ? `, ${pct(g.prevShare)} від попереднього)`
                  : ")") +
                (g.hint ? ` — ${g.hint}` : "")}
            </title>

            {/* Роздільник між кроками — тонка щілина, як на макеті. */}
            {g.i > 0 && (
              <line
                x1={g.x}
                x2={g.x}
                y1={cy - bandH / 2}
                y2={cy + bandH / 2}
                stroke="var(--card)"
                strokeWidth={3}
              />
            )}

            {/* Абсолют — над стрічкою. */}
            <text
              x={g.x + flat / 2}
              y={PAD_TOP - 18}
              textAnchor="middle"
              fontSize={20}
              fontWeight={600}
              fill="currentColor"
            >
              {n(g.value)}
            </text>

            {/* Наскрізна частка — пігулкою по центру стрічки. */}
            <g>
              <rect
                x={g.x + flat / 2 - 30}
                y={cy - 13}
                width={60}
                height={26}
                rx={13}
                fill="var(--foreground)"
              />
              <text
                x={g.x + flat / 2}
                y={cy + 5}
                textAnchor="middle"
                fontSize={14}
                fontWeight={600}
                fill="var(--background)"
              >
                {pct(g.share, 0)}
              </text>
            </g>

            {/* Підпис і втрата до попереднього кроку — під стрічкою. */}
            <text
              x={g.x + flat / 2}
              y={height - PAD_BOTTOM + 22}
              textAnchor="middle"
              fontSize={14}
              fill="var(--muted-foreground)"
            >
              {g.label}
            </text>
            {g.prevShare != null && (
              <text
                x={g.x + flat / 2}
                y={height - PAD_BOTTOM + 38}
                textAnchor="middle"
                fontSize={12}
                fill="var(--muted-foreground)"
                opacity={0.75}
              >
                {pct(g.prevShare, 0)} від попереднього
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function safeShare(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}
