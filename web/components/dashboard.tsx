import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hoursSince, snapshotLabel } from "@/lib/format";

// ── Обгортка контенту сторінки ──────────────────────────────────────────

export function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">{children}</main>
  );
}

// ── Секція-глава ────────────────────────────────────────────────────────
// Кожна секція починається з РЕЧЕННЯ з реальним числом, і лише потім ідуть
// графіки. Речення — це те, що перетворює набір плиток на історію: людина,
// яка не в темі, має зрозуміти висновок, не читаючи осей.

export function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">
          {title}
        </h2>
        {lead && (
          <p className="max-w-4xl text-[15px] leading-relaxed">{lead}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Виділення числа всередині речення-ліда */
export function Hl({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold tabular-nums">{children}</strong>;
}

// ── KPI ─────────────────────────────────────────────────────────────────

export function Kpi({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: { text: string; good: boolean | null };
}) {
  const Icon =
    trend?.good === null ? Minus : trend?.good ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-1 pb-4">
        <div className="text-2xl font-semibold tabular-nums tracking-tight lg:text-3xl">
          {value}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
                trend.good === null && "bg-muted text-muted-foreground",
                trend.good === true &&
                  "bg-[var(--status-good)]/12 text-[var(--status-good)]",
                trend.good === false &&
                  "bg-[var(--status-critical)]/12 text-[var(--status-critical)]"
              )}
            >
              <Icon className="size-3" />
              {trend.text}
            </span>
          )}
          {sub && (
            <span className="text-xs text-muted-foreground">{sub}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Панель графіка ──────────────────────────────────────────────────────

export function Panel({
  title,
  note,
  className,
  children,
}: {
  title: string;
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="gap-1 border-b px-4 py-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {note && (
          <p className="text-xs leading-snug text-muted-foreground">{note}</p>
        )}
      </CardHeader>
      <CardContent className="px-3 py-3">{children}</CardContent>
    </Card>
  );
}

// ── Свіжість ────────────────────────────────────────────────────────────
// Свіжість — це контракт, а не дрібниця в куточку. Поки оновлення ручне,
// зріз легко може протухнути, і глядач має це БАЧИТИ, а не дізнаватись
// постфактум, що дивився на позаминулий тиждень.

export function Freshness({ snapshotAt }: { snapshotAt: string }) {
  const h = hoursSince(snapshotAt);
  const state = h < 36 ? "fresh" : h < 24 * 7 ? "stale" : "broken";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="size-1.5 rounded-full"
        style={{
          background:
            state === "fresh"
              ? "var(--status-good)"
              : state === "stale"
                ? "var(--status-warning)"
                : "var(--status-critical)",
        }}
      />
      <span className="text-muted-foreground">
        {snapshotLabel(snapshotAt)}
      </span>
      {state !== "fresh" && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
          {state === "stale" ? "потребує оновлення" : "застарілі"}
        </Badge>
      )}
    </div>
  );
}
