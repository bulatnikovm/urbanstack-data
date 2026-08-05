import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Freshness } from "@/components/dashboard";
import { getMeta } from "@/lib/data";
import { monthLabel } from "@/lib/format";

/**
 * Шапка сторінки. Липка, щоб свіжість даних і поточний період було видно
 * на будь-якій глибині скролу — це те, що глядач має бачити завжди.
 */
export function PageHeader({
  title,
  subtitle,
  monthKey,
}: {
  title: string;
  subtitle: string;
  monthKey: string;
}) {
  const meta = getMeta();
  return (
    <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-1 border-b bg-background/80 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
        </div>
        <div className="hidden sm:block">
          <Freshness snapshotAt={meta.snapshot_at} />
        </div>
      </div>
      <p className="pl-9 text-xs text-muted-foreground">
        {subtitle} · дані за {monthLabel(monthKey)}
      </p>
    </header>
  );
}
