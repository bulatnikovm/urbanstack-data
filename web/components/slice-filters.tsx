"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SliceSel } from "@/lib/data-operational";
import { n } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Фільтри сторінки «Операційна ефективність (SLA)»: Категорія · Тип заявки ·
 * Тег. Ті самі три розрізи, що були дропдаунами в оригінальному звіті Looker
 * (тег додано на прохання Максима 2026-08-26).
 *
 * ── Набір значень і напрям, а не одне значення ────────────────────────────
 * Правка Максима 2026-08-28: «потрібна можливість не просто вибрати щось
 * одне, а вибрати за виключенням». У Looker це був окремий режим дропдауна
 * («Тип заявки (Виключить 1)») — і саме його бракувало: коли типів двадцять,
 * а прибрати треба два, перелічувати вісімнадцять ніхто не буде.
 *
 * Тому кожен розріз тепер має два стани: набір значень і напрям — показати
 * саме їх («Показати») чи все, крім них («Виключити»). Порожній набір в
 * обох режимах означає «усі».
 *
 * ── Чому вибір застосовується на ЗАКРИТТІ, а не на кожній галочці ─────────
 * Лічильники в опціях залежать від сусідніх фільтрів, а список відсортований
 * за лічильником. Якби кожна галочка одразу їхала в URL, список
 * перебудовувався б і ПЕРЕСОРТОВУВАВСЯ під курсором між двома кліками —
 * друга галочка ставала б не там, куди цілились. Тому всередині випадайки
 * живе чернетка, а в URL вона їде один раз: кнопкою «Готово», кліком повз
 * або по Esc. Втратити вибір неможливо — закриття будь-яким способом
 * застосовує.
 *
 * Пишуть в URL, фільтрація виконується на СЕРВЕРІ (сторінка читає ті самі
 * параметри) — з двох причин: посилання на зріз можна переслати, і в
 * клієнтський бандл не їде повний mart заявок.
 */

export type SliceOption = { value: string; label: string; count: number };

/** З якої кількості опцій список отримує пошук. */
const SEARCH_FROM = 8;

const same = (a: SliceSel, b: SliceSel) =>
  a.mode === b.mode &&
  a.values.length === b.values.length &&
  a.values.every((v) => b.values.includes(v));

function triggerLabel(sel: SliceSel, allLabel: string, options: SliceOption[]) {
  if (sel.values.length === 0) return allLabel;
  const first = sel.values[0];
  const count = options.find((o) => o.value === first)?.count;
  const head =
    sel.values.length === 1
      ? count === undefined
        ? first
        : `${first} · ${n(count)}`
      : `${first} +${sel.values.length - 1}`;
  return sel.mode === "ex" ? `Крім: ${head}` : head;
}

function SliceSelect({
  param,
  label,
  allLabel,
  options,
  active,
  onApply,
  pending,
}: {
  param: string;
  label: string;
  allLabel: string;
  options: SliceOption[];
  active: SliceSel;
  onApply: (param: string, sel: SliceSel) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SliceSel>(active);
  const [query, setQuery] = useState("");

  // Обране значення могло випасти з довідника через сусідній фільтр
  // (напр. «Скарга» + тег, у якому скарг немає). Додаємо його в список
  // явно — інакше випадайка мовчки показала б «Усі», хоча фільтр діє.
  const all = useMemo(() => {
    const missing = active.values
      .filter((v) => !options.some((o) => o.value === v))
      .map((value) => ({ value, label: value, count: 0 }));
    return [...missing, ...options];
  }, [options, active.values]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;
  }, [all, query]);

  function close(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(active);
      setQuery("");
      return;
    }
    if (!same(draft, active)) onApply(param, draft);
  }

  const toggle = (value: string) =>
    setDraft((d) => ({
      ...d,
      values: d.values.includes(value)
        ? d.values.filter((v) => v !== value)
        : [...d.values, value],
    }));

  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={close}>
        <PopoverTrigger
          disabled={pending || all.length === 0}
          render={
            <Button
              variant="outline"
              className={cn(
                "h-9 w-full justify-between gap-2 px-3 font-normal",
                active.values.length === 0 && "text-muted-foreground"
              )}
            >
              <span className="truncate">
                {triggerLabel(active, allLabel, all)}
              </span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </Button>
          }
        />

        <PopoverContent align="start" className="w-[280px] gap-0 p-0">
          {/* Напрям. Дві кнопки, а не галочка «інвертувати»: «виключити» —
              це не властивість вибору, а протилежне питання, і воно має
              бути видимим ДО того, як людина почала клацати значення. */}
          <div className="flex gap-1 border-b p-1.5">
            {(
              [
                { mode: "in", label: "Показати" },
                { mode: "ex", label: "Виключити" },
              ] as const
            ).map((m) => (
              <Button
                key={m.mode}
                variant={draft.mode === m.mode ? "secondary" : "ghost"}
                size="sm"
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={() => setDraft((d) => ({ ...d, mode: m.mode }))}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {all.length >= SEARCH_FROM && (
            <div className="relative border-b p-1.5">
              <Search className="absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук"
                className="h-7 pl-7 text-xs"
              />
            </div>
          )}

          <ul className="max-h-[240px] overflow-auto p-1">
            {shown.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                Нічого не знайшлось
              </li>
            )}
            {shown.map((o) => {
              const picked = draft.values.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        picked
                          ? draft.mode === "ex"
                            ? "border-[var(--status-critical)] bg-[var(--status-critical)] text-white"
                            : "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      )}
                    >
                      {picked && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {n(o.count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t p-1.5">
            <span className="pl-1 text-[11px] text-muted-foreground">
              {draft.values.length === 0
                ? "Усі значення"
                : `${draft.mode === "ex" ? "Виключено" : "Обрано"} ${draft.values.length}`}
            </span>
            <div className="flex gap-1">
              {draft.values.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setDraft((d) => ({ ...d, values: [] }))}
                >
                  Скинути
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => close(false)}
              >
                Готово
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SliceFilters({
  categories,
  types,
  tags,
  active,
}: {
  categories: SliceOption[];
  types: SliceOption[];
  tags: SliceOption[];
  active: { category: SliceSel; type: SliceSel; tag: SliceSel };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function push(params: URLSearchParams) {
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function apply(param: string, sel: SliceSel) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(param);
    params.delete(`${param}mode`);
    for (const v of sel.values) params.append(param, v);
    // Напрям пишемо, лише коли він щось означає: `?typemode=ex` без жодного
    // значення — сміття в посиланні, яке нічого не фільтрує.
    if (sel.values.length > 0 && sel.mode === "ex") {
      params.set(`${param}mode`, "ex");
    }
    push(params);
  }

  const any =
    active.category.values.length > 0 ||
    active.type.values.length > 0 ||
    active.tag.values.length > 0;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card px-3 py-2.5">
      <SliceSelect
        param="cat"
        label="Категорія"
        allLabel="Усі категорії"
        options={categories}
        active={active.category}
        onApply={apply}
        pending={pending}
      />
      <SliceSelect
        param="type"
        label="Тип заявки"
        allLabel="Усі типи"
        options={types}
        active={active.type}
        onApply={apply}
        pending={pending}
      />
      <SliceSelect
        param="tag"
        label="Тег"
        allLabel={tags.length ? "Усі теги" : "Тегів за період немає"}
        options={tags}
        active={active.tag}
        onApply={apply}
        pending={pending}
      />

      <div className="flex h-9 items-center gap-1.5">
        {any && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              for (const k of ["cat", "type", "tag"]) {
                params.delete(k);
                params.delete(`${k}mode`);
              }
              push(params);
            }}
          >
            <X className="size-3" />
            Скинути
          </Button>
        )}
        {pending && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
