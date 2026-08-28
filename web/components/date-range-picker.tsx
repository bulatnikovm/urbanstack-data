"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

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
 *
 * ── Дві панелі, а не один список років ────────────────────────────────────
 * Перша версія була вертикальним списком усіх місяців від 2021-го з
 * підказкою «тепер оберіть кінець»: вибір робився двома кліками поспіль, і
 * поки не зробиш другий, незрозуміло, у якому ти стані. Плюс потрібний рік
 * доводилось шукати прокруткою в віконці 260 пікселів (зауваження Микити
 * 2026-08-28 — «не подобається, як виглядає вибір дат»).
 *
 * Тепер це звичайний range-пікер: ліва панель — початок, права — кінець,
 * у кожної свій перемикач року й сітка з 12 місяців. Обидва кінці видно
 * одночасно, клікати їх можна в будь-якому порядку й скільки завгодно
 * разів, а період їде в URL лише по «Застосувати».
 */
const MONTHS_SHORT = [
  "січ", "лют", "бер", "квіт", "трав", "черв",
  "лип", "серп", "вер", "жовт", "лист", "груд",
];

const yearOf = (key: string) => Number(key.slice(0, 4));
const monthKey = (year: number, monthIdx: number) =>
  `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

/**
 * Одна панель: рік із перемикачем і 12 місяців.
 *
 * Місяці поза межами даних лишаються на місці, але неактивні — сітка з 12
 * клітинок читається як календар, а сітка з семи (бо решти «немає»)
 * читається як зіпсований рендер.
 */
function MonthPane({
  title,
  year,
  onYear,
  bounds,
  value,
  range,
  onPick,
}: {
  title: string;
  year: number;
  onYear: (y: number) => void;
  bounds: { min: string; max: string };
  /** Кінець, який редагує ця панель. */
  value: string;
  /** Обидва кінці — для підсвітки місяців усередині діапазону. */
  range: Range;
  onPick: (key: string) => void;
}) {
  const minYear = yearOf(bounds.min);
  const maxYear = yearOf(bounds.max);

  return (
    <div className="flex flex-col gap-2 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          {title}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={year <= minYear}
            aria-label="Попередній рік"
            onClick={() => onYear(year - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="w-9 text-center text-xs font-medium tabular-nums">
            {year}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={year >= maxYear}
            aria-label="Наступний рік"
            onClick={() => onYear(year + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {MONTHS_SHORT.map((label, idx) => {
          const key = monthKey(year, idx);
          const disabled = key < bounds.min || key > bounds.max;
          const selected = key === value;
          const inRange = key >= range.from && key <= range.to;
          return (
            <button
              key={key}
              disabled={disabled}
              onClick={() => onPick(key)}
              className={cn(
                "h-8 rounded-md text-xs transition-colors",
                disabled && "cursor-not-allowed text-muted-foreground/40",
                !disabled && !inRange && "hover:bg-muted",
                !disabled && inRange && !selected && "bg-accent text-accent-foreground",
                selected && "bg-primary font-medium text-primary-foreground"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

  const [draft, setDraft] = useState<Range>(range);
  const [fromYear, setFromYear] = useState(yearOf(range.from));
  const [toYear, setToYear] = useState(yearOf(range.to));

  const months = monthsBetween(draft.from, draft.to).length;

  function apply(next: Range) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", next.from);
    params.set("to", next.to);
    // Закриваємо ПОЗА transition. Усередині це низькопріоритетне
    // оновлення, яке чекає на завершення серверного рендеру, — і
    // випадайка ще секунду стоїть відкритою над уже перемальованою
    // сторінкою (перевірено 2026-08-28). Індикатор роботи лишається на
    // кнопці: `pending` малює спінер замість іконки календаря.
    setOpen(false);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function reset(to: Range) {
    setDraft(to);
    setFromYear(yearOf(to.from));
    setToYear(yearOf(to.to));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Чернетку скидаємо на відкритті, а не на закритті: закриття без
        // «Застосувати» має лишити на екрані рівно те, що було.
        if (o) reset(range);
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

      <PopoverContent
        align="end"
        className="w-[min(92vw,460px)] gap-0 p-0"
      >
        <div className="flex flex-wrap gap-1 border-b p-2">
          {PRESETS.map((p) => {
            const r = presetRange(p.months, bounds);
            const active = r.from === draft.from && r.to === draft.to;
            return (
              <Button
                key={p.label}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={() => reset(r)}
              >
                {p.label}
              </Button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <MonthPane
            title="Початок"
            year={fromYear}
            onYear={setFromYear}
            bounds={bounds}
            value={draft.from}
            range={draft}
            onPick={(key) =>
              // Початок пізніше за кінець — не помилка, а нормальний спосіб
              // «пересунути вікно вперед»: тягнемо кінець за собою, а не
              // забороняємо клік.
              setDraft((d) => ({ from: key, to: key > d.to ? key : d.to }))
            }
          />
          <MonthPane
            title="Кінець"
            year={toYear}
            onYear={setToYear}
            bounds={bounds}
            value={draft.to}
            range={draft}
            onPick={(key) =>
              setDraft((d) => ({ from: key < d.from ? key : d.from, to: key }))
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-2">
          <span className="pl-1 text-[11px] text-muted-foreground tabular-nums">
            {monthLabel(draft.from)} — {monthLabel(draft.to)} · {months}{" "}
            {months === 1 ? "місяць" : months < 5 ? "місяці" : "місяців"}
          </span>
          <Button
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => apply(draft)}
          >
            Застосувати
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
