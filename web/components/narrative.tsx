import { TriangleAlert, Sparkles } from "lucide-react";

import { getInsights, getNarrative, stripOrder } from "@/lib/data";
import { plural } from "@/lib/format";
import { inLab } from "@/lib/lab";

/**
 * Підсумок секції за останній ЗАКРИТИЙ місяць: що змінилось і на скільки.
 *
 * Текст береться готовим з `web/data/narrative.json` — він порахований один
 * раз після оновлення даних, а не на кожен перегляд. Так усі глядачі бачать
 * ОДНЕ формулювання: дашборд шеринговий, і різні тексти про ті самі цифри
 * швидко перетворюються на «а в мене написано інакше».
 *
 * Помітка про походження тексту показується завжди. Читач має бачити, що
 * речення написала модель, — і що числа в ньому пройшли перевірку на збіг із
 * рядками детектора, а не взялись зі стелі.
 *
 * ⚠️ Поки функція на обкатці — видно лише адміну (`lib/lab.ts`), як і
 * сторінку `/adoption` під областю `drafts`. Решта не бачить ні тексту, ні
 * позначок аномалій: блок просто не рендериться, а не показується порожнім.
 */
export async function Narrative({ section }: { section: string }) {
  if (!(await inLab())) return null;

  const narrative = getNarrative(section);
  if (!narrative) return null;

  const insights = getInsights(section, narrative.monthKey);
  const dataGap = insights.some((i) => i.is_suspected_data_gap);
  const critical = insights.filter((i) => i.severity === "critical").length;

  // Порожня секція — найчастіший випадок. Показуємо тихо й дрібно, щоб
  // «нічого не сталось» не важило на сторінці стільки ж, скільки справжня
  // новина.
  const quiet = narrative.source === "no_anomalies";

  const origin =
    narrative.source === "llm"
      ? "Згенеровано моделлю з рядків детектора; числа звірені"
      : narrative.source === "template_rejected"
        ? "Текст моделі відхилено перевіркою чисел — показано автоматичний опис"
        : narrative.source === "template"
          ? "Автоматичний опис із рядків детектора"
          : "Відхилень не знайдено";

  return (
    <div
      className={
        "rounded-lg border px-4 py-3 " +
        (dataGap
          ? "border-[var(--status-critical)]/40 bg-[var(--status-critical)]/5"
          : quiet
            ? "bg-muted/30"
            : "bg-muted/50")
      }
    >
      <div className="flex items-start gap-2.5">
        {dataGap ? (
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-[var(--status-critical)]"
            aria-hidden
          />
        ) : (
          <Sparkles
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}

        <div className="min-w-0 space-y-1.5">
          <p
            className={
              quiet
                ? "text-sm text-muted-foreground"
                : "text-sm leading-relaxed text-foreground"
            }
          >
            {narrative.text}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span title={origin}>{origin}</span>
            {insights.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {insights.length}{" "}
                  {plural(
                    insights.length,
                    "відхилення",
                    "відхилення",
                    "відхилень"
                  )}
                  {critical > 0
                    ? ` (${critical} ${plural(critical, "критичне", "критичні", "критичних")})`
                    : ""}
                </span>
              </>
            )}
          </div>

          {insights.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-0.5">
              {insights.slice(0, 6).map((i) => (
                <li
                  key={`${i.series_key}|${i.dimension_value}`}
                  className={
                    "rounded border px-1.5 py-0.5 text-[11px] " +
                    (i.impact === "bad"
                      ? "border-[var(--status-critical)]/30 text-[var(--status-critical)]"
                      : i.impact === "good"
                        ? "border-[var(--status-good)]/30 text-[var(--status-good)]"
                        : "text-muted-foreground")
                  }
                  title={i.verdict}
                >
                  {/*
                    Показник named ПЕРШИМ, розріз другим. Без назви показника
                    дві плашки одного ЖК читаються однаково («Варшавський
                    Плюс −27,5%» двічі), хоча це різні речі — потенційні й
                    підтверджені. Той самий недогляд, що був у тексті: підпис
                    ряду вже приїхав у `label_ua`, просто сюди не дійшов.
                  */}
                  {i.label_ua}
                  {i.dimension_key !== "total" && (
                    <span className="opacity-70">
                      {" · "}
                      {stripOrder(i.dimension_value)}
                    </span>
                  )}
                  {i.mom_pct !== null && (
                    <span className="opacity-70">
                      {" "}
                      {i.mom_pct > 0 ? "+" : "−"}
                      {Math.abs(i.mom_pct * 100).toFixed(1)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
