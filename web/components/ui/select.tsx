"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Випадайка на Base UI — тим самим примітивом, що й `dropdown-menu.tsx`.
 *
 * Навіщо, коли є нативний `<select>`: список опцій нативного селекта малює
 * ОПЕРАЦІЙНА СИСТЕМА, і застилізувати його не можна взагалі — ні
 * заокруглень, ні відступів, ні шрифту дашборду (`border-radius` на
 * `<option>` браузери ігнорують). Base UI рендерить список звичайним DOM,
 * тож він виглядає як решта інтерфейсу.
 *
 * Ціна — випадайка живе в портлі й потребує клієнтського JS. Тому нативний
 * `<select>` лишається доречним там, де вигляд не критичний
 * (`health-filters.tsx`).
 */

function Select(props: SelectPrimitive.Root.Props<string | null>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-sm",
        "transition-colors hover:bg-accent/50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        "data-[popup-open]:bg-accent/50 disabled:opacity-50",
        className
      )}
      {...props}
    >
      <>
        {children}
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
          <ChevronsUpDownIcon className="size-3.5" />
        </SelectPrimitive.Icon>
      </>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className="truncate text-left"
      {...props}
    />
  );
}

function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={6}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            // Заокруглена панель + внутрішній відступ: саме він дає
            // «повітря» навколо заокруглених рядків, інакше кут виділення
            // впирається в край панелі й скруглення не видно.
            "max-h-[min(24rem,var(--available-height))] min-w-[var(--anchor-width)]",
            "overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg",
            "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <>
        <SelectPrimitive.ItemText className="flex-1 truncate">
          {children}
        </SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="shrink-0">
          <CheckIcon className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
