"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Фільтри стрічки коментарів. Пишуть у URL, а не в локальний стан — з тієї
 * самої причини, що й дейт-пікер: посилання на «всі скарги на охорону в
 * Окленді» можна кинути керівнику ЖК, і воно відкриється тим самим.
 *
 * Фільтрація виконується на СЕРВЕРІ (сторінка читає ті самі параметри), тому
 * в клієнтський бандл їде відфільтрована сотня коментарів, а не всі півтори
 * тисячі.
 */

export type FilterOption = { value: string; label: string; count?: number };

function Group({
  param,
  label,
  options,
  active,
  onPick,
  pending,
}: {
  param: string;
  label: string;
  options: FilterOption[];
  active: string | null;
  onPick: (param: string, value: string | null) => void;
  pending: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {options.map((o) => {
        const on = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            onClick={() => onPick(param, on ? null : o.value)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
              "hover:bg-accent disabled:opacity-50",
              on
                ? "border-foreground/25 bg-foreground/8 font-medium text-foreground"
                : "border-transparent bg-muted/60 text-muted-foreground"
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className="ml-1 tabular-nums opacity-60">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CsatFilters({
  complexes,
  themes,
  grades,
  activeComplex,
  activeTheme,
  activeGrade,
}: {
  complexes: FilterOption[];
  themes: FilterOption[];
  grades: FilterOption[];
  activeComplex: string | null;
  activeTheme: string | null;
  activeGrade: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pick(param: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(param);
    else params.set(param, value);
    startTransition(() => {
      // `scroll: false` — інакше після кліку по фільтру сторінка стрибає
      // вгору, а стрічка коментарів живе в самому низу.
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const any = activeComplex || activeTheme || activeGrade;

  return (
    <div className="flex flex-col gap-2">
      <Group
        param="ck"
        label="ЖК"
        options={complexes}
        active={activeComplex}
        onPick={pick}
        pending={pending}
      />
      <Group
        param="theme"
        label="Тема"
        options={themes}
        active={activeTheme}
        onPick={pick}
        pending={pending}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Group
          param="grade"
          label="Оцінка"
          options={grades}
          active={activeGrade}
          onPick={pick}
          pending={pending}
        />
        {any && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              for (const k of ["ck", "theme", "grade"]) params.delete(k);
              startTransition(() => {
                router.push(`${pathname}?${params.toString()}`, {
                  scroll: false,
                });
              });
            }}
          >
            <X className="size-3" />
            Скинути
          </Button>
        )}
        {pending && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
