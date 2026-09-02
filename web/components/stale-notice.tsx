import { TriangleAlert } from "lucide-react";

import { dashboardFreshness } from "@/lib/freshness";
import { snapshotLabel } from "@/lib/format";

/**
 * Смуга «дані не оновились» над сторінкою.
 *
 * ── Навіщо, якщо в шапці вже є бейдж свіжості ─────────────────────────────
 * Бейдж відповідає на питання «коли зріз», і відповідає тихо: сірий текст у
 * правому куті, до того ж прихований на екранах вужчих за 1024 px. Коли
 * 28.08.2026 нічне оновлення не пройшло, першим це помітив не дашборд, а
 * людина — і не з екрана, а з відчуття «цифри ті самі, що вчора».
 *
 * Тому стан «оновлення не пройшло» отримав окреме, помітне повідомлення:
 * воно каже не тільки КОЛИ зріз, а й що з цим робити. Показується лише
 * тоді, коли справді є проблема — у нормальний день на екрані його немає
 * взагалі, інакше воно перетвориться на шпалери, які ніхто не читає.
 *
 * Стоїть НАД липкою шапкою й скролиться разом зі сторінкою: попередження
 * має бути першим, що бачиш, але не має з'їдати висоту на кожному екрані.
 *
 * Серверний компонент: свіжість рахується з `_meta.json` на сервері, у
 * браузер не їде ні дата, ні логіка.
 */
export function StaleNotice() {
  const { state, ageDays, snapshotAt } = dashboardFreshness();
  if (state === "fresh") return null;

  const late = state === "late";
  const color = late ? "var(--status-warning)" : "var(--status-critical)";

  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-x-2 gap-y-1 border-b px-4 py-2.5 text-xs md:px-6"
      style={{
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" style={{ color }} />
      <span className="font-medium" style={{ color }}>
        {late
          ? "Дані не оновились сьогодні"
          : `Дані застаріли на ${ageDays} ${ageDays < 5 ? "дні" : "днів"}`}
      </span>
      <span className="text-muted-foreground">
        На екрані зріз від{" "}
        <span className="font-medium text-foreground">
          {snapshotLabel(snapshotAt)}
        </span>{" "}
        за Києвом.{" "}
        {late
          ? "Ранкове оновлення о 07:00 не пройшло — тобто або задача Cloud Scheduler не спрацювала (найімовірніше скінчився токен), або впав сам прогін. Опівдні є страхувальний запуск від GitHub."
          : "Оновлення не проходить не перший день — це вже не випадковий збій, треба дивитись логи прогону."}{" "}
        Запустити вручну: Actions → «Оновити дашборди» → Run workflow.
      </span>
    </div>
  );
}
