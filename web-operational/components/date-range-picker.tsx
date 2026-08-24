"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/format";
import { PRESETS, presetRange, monthsBetween, type Range } from "@/lib/period";

/**
 * Вибір діапазону МІСЯЦІВ. Грануляція навмисна — усі марти помісячні
 * (див. lib/period.ts).
 *
 * Записує вибір в URL, а не в локальний стан: посилання на конкретний
 * період можна переслати, і воно відкриється тим самим.
 */
export function DateRangePicker({
  range,
  bounds,
}: {
  range: Range;
  bounds: { min: string; max: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Кінець, який зараз обирають: спочатку "від", потім "до"
  const [picking, setPicking] = useState<"from" | "to">("from");
  const [draft, setDraft] = useState<Range>(range);

  const allMonths = monthsBetween(bounds.min, bounds.max);
  const years = [...new Set(allMonths.map((m) => m.slice(0, 4)))].reverse();

  function apply(next: Range) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", next.from);
    params.set("to", next.to);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      setOpen(false);
      setPicking("from");
    });
  }

  function pickMonth(m: string) {
    if (picking === "from") {
      setDraft({ from: m, to: m > draft.to ? m : draft.to });
      setPicking("to");
      return;
    }
    // Другий клік раніше за перший — трактуємо як новий початок, а не помилку
    const next: Range = m < draft.from ? { from: m, to: draft.from } : { from: draft.from, to: m };
    setDraft(next);
    apply(next);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(range);
          setPicking("from");
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CalendarRange className="size-3.5" />
            )}
            <span className="tabular-nums">
              {monthLabel(range.from)} — {monthLabel(range.to)}
            </span>
          </Button>
        }
      />

      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {PRESETS.map((p) => {
            const r = presetRange(p.months, bounds);
            const active = r.from === range.from && r.to === range.to;
            return (
              <Button
                key={p.label}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={() => apply(r)}
              >
                {p.label}
              </Button>
            );
          })}
        </div>

        <div className="border-b px-3 py-2 text-[11px] text-muted-foreground">
          {picking === "from" ? (
            <>Оберіть <span className="font-medium text-foreground">початок</span> періоду</>
          ) : (
            <>
              Початок: <span className="font-medium text-foreground">{monthLabel(draft.from)}</span>
              {" · "}тепер оберіть <span className="font-medium text-foreground">кінець</span>
            </>
          )}
        </div>

        <div className="max-h-[260px] overflow-auto p-2">
          {years.map((y) => {
            const months = allMonths.filter((m) => m.startsWith(y));
            return (
              <div key={y} className="mb-2 last:mb-0">
                <div className="px-1 pb-1 text-[10px] font-medium text-muted-foreground">
                  {y}
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {months.map((m) => {
                    const inRange = m >= draft.from && m <= draft.to;
                    const isEdge = m === draft.from || m === draft.to;
                    return (
                      <button
                        key={m}
                        onClick={() => pickMonth(m)}
                        className={cn(
                          "flex h-7 items-center justify-center gap-0.5 rounded-md text-[11px] transition-colors",
                          isEdge
                            ? "bg-primary font-medium text-primary-foreground"
                            : inRange
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted"
                        )}
                      >
                        {monthLabel(m).split(" ")[0]}
                        {isEdge && <Check className="size-2.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
