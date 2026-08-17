import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Freshness } from "@/components/dashboard";
import { DateRangePicker } from "@/components/date-range-picker";
import { ThemeToggle } from "@/components/theme";
import { getMeta } from "@/lib/data";
import { monthLabel } from "@/lib/format";
import type { Range } from "@/lib/period";

/**
 * Шапка сторінки. Липка, щоб свіжість даних, обраний період і поточний
 * місяць було видно на будь-якій глибині скролу.
 */
export function PageHeader({
  title,
  subtitle,
  monthKey,
  partial,
  range,
  bounds,
}: {
  title: string;
  subtitle: string;
  monthKey: string;
  /**
   * Поточний місяць ще триває. Банер прибрано за проханням Микити — потрібен
   * стан «як зараз», а не останній повний місяць. Але позначку лишаємо: без
   * неї 5 серпня всі лічильники виглядають як обвал на 80%, і це перше, про
   * що спитає будь-хто, кому кинули посилання.
   */
  partial?: { daysElapsed: number; daysInMonth: number };
  range: Range;
  bounds: { min: string; max: string };
}) {
  const meta = getMeta();
  return (
    <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-1.5 border-b bg-background/80 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
        </div>
        <DateRangePicker range={range} bounds={bounds} />
        <ThemeToggle />
        <div className="hidden lg:block">
          <Freshness snapshotAt={meta.snapshot_at} />
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 pl-9 text-xs text-muted-foreground">
        <span>
          {subtitle} · показники за {monthLabel(monthKey)}
        </span>
        {partial && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background:
                "color-mix(in oklab, var(--status-warning) 15%, transparent)",
              color: "var(--status-warning)",
            }}
            title="Місяць ще триває — місячні лічильники неповні, дельти до попереднього місяця тимчасово вʼїжджають у мінус"
          >
            місяць триває · {partial.daysElapsed} з {partial.daysInMonth} днів
          </span>
        )}
      </p>
    </header>
  );
}
