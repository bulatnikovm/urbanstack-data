"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { n } from "@/lib/format";

/**
 * Фільтри сторінки «Операційна ефективність (SLA)»: Категорія · Тип заявки ·
 * Тег. Ті самі три розрізи, що були дропдаунами в оригінальному звіті Looker
 * (тег додано на прохання Максима 2026-08-26).
 *
 * ── Чому дропдауни, а не кнопки ───────────────────────────────────────────
 * Перша версія показувала кожне значення окремою кнопкою з лічильником. На
 * малюнку це виглядало інформативно, але на реальних даних дало три ряди по
 * 15 елементів — половину першого екрана сторінки з'їдав сам фільтр, а
 * зведена таблиця, заради якої люди сюди й ходять, опинялась нижче згину
 * (зауваження Микити 2026-08-27). Дропдаун повертає той самий вигляд, що в
 * Looker, і лічильники нікуди не діваються — вони в тексті опції.
 *
 * ⚠️ Це НЕ нативний `<select>`, і саме тому. Список опцій нативного селекта
 * малює операційна система: ні заокруглень, ні відступів, ні шрифту дашборду
 * (`border-radius` на `<option>` браузери ігнорують). Тут — `components/ui/
 * select.tsx` на Base UI, тому опції виглядають як решта інтерфейсу.
 *
 * Пишуть в URL, фільтрація виконується на СЕРВЕРІ (сторінка читає ті самі
 * параметри) — з двох причин: посилання на зріз можна переслати, і в
 * клієнтський бандл не їде повний mart заявок.
 */

export type SliceOption = { value: string; label: string; count: number };

const ALL = "__all__";

function SliceSelect({
  param,
  label,
  allLabel,
  options,
  active,
  onPick,
  pending,
}: {
  param: string;
  label: string;
  allLabel: string;
  options: SliceOption[];
  active: string | null;
  onPick: (param: string, value: string | null) => void;
  pending: boolean;
}) {
  // Обране значення могло випасти з довідника через сусідній фільтр
  // (напр. «Скарга» + тег, у якому скарг немає). Додаємо його в список
  // явно — інакше випадайка мовчки показала б «Усі», хоча фільтр діє.
  const shown =
    active && !options.some((o) => o.value === active)
      ? [{ value: active, label: active, count: 0 }, ...options]
      : options;

  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <Select
        value={active ?? ALL}
        onValueChange={(v) => onPick(param, v === ALL ? null : (v as string))}
        disabled={pending}
        items={[
          { value: ALL, label: allLabel },
          ...shown.map((o) => ({
            value: o.value,
            label: `${o.label} · ${n(o.count)}`,
          })),
        ]}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {shown.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label} · {n(o.count)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
  active: { category: string | null; type: string | null; tag: string | null };
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
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const any = active.category || active.type || active.tag;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card px-3 py-2.5">
      <SliceSelect
        param="cat"
        label="Категорія"
        allLabel="Усі категорії"
        options={categories}
        active={active.category}
        onPick={pick}
        pending={pending}
      />
      <SliceSelect
        param="type"
        label="Тип заявки"
        allLabel="Усі типи"
        options={types}
        active={active.type}
        onPick={pick}
        pending={pending}
      />
      <SliceSelect
        param="tag"
        label="Тег"
        allLabel={tags.length ? "Усі теги" : "Тегів за період немає"}
        options={tags}
        active={active.tag}
        onPick={pick}
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
              for (const k of ["cat", "type", "tag"]) params.delete(k);
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
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
