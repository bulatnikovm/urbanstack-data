"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Перемикач напрямку опитування (ANA-19).
 *
 * Микита: «хотів перемикати категорію і бачити історію по ній — обрати
 * охорону і бачити, які були голоси за грудень, які за червень».
 *
 * Тому перемикається саме НАПРЯМОК, а не хвиля. Хвиля — це один напрямок в
 * одному місяці, і перемикати її поодинці нема сенсу: три напрямки
 * опитуються за різними розкладами (Охорона тричі — груд. 2025, трав. і лип.
 * 2026; Прибудинкова й Будинкова двічі — черв. і серп. 2026), тож «хвиля
 * №2» для них означала б різні місяці. Обравши напрямок, людина бачить усі
 * його хвилі поспіль — і в динаміці, і в матриці по ЖК.
 *
 * Стан живе в URL, а не в компоненті: посилання на «охорону» можна
 * переслати, і воно відкриється тим самим.
 */

export type CategoryOption = {
  value: string;
  label: string;
  /** Скільки хвиль було в цього напрямку — головна підказка при виборі. */
  waves: number;
};

export function CsatCategorySwitch({
  options,
  active,
}: {
  options: CategoryOption[];
  active: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pick(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("cat", value);
    else params.delete("cat");
    // Фільтри стрічки коментарів лишаються — вони про інше (ЖК, тема,
    // оцінка) і з напрямком не конфліктують.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const all: Array<CategoryOption | null> = [null, ...options];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        Напрямок
      </span>
      <div className="flex flex-wrap gap-1.5">
        {all.map((o) => {
          const on = o === null ? active === null : active === o.value;
          return (
            <button
              key={o?.value ?? "*"}
              type="button"
              disabled={pending}
              onClick={() => pick(o?.value ?? null)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                "hover:bg-accent disabled:opacity-50",
                on
                  ? "border-foreground/25 bg-foreground/8 font-medium text-foreground"
                  : "border-transparent bg-muted/60 text-muted-foreground"
              )}
            >
              {o?.label ?? "Усі напрямки"}
              {o && (
                <span className="ml-1.5 tabular-nums opacity-60">
                  {o.waves}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pending && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <span className="ml-auto text-[11px] text-muted-foreground">
        {active
          ? "показано всі хвилі цього напрямку"
          : "цифра поруч — скільки було хвиль"}
      </span>
    </div>
  );
}
