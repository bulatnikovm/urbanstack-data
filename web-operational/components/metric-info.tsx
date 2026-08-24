"use client";

import { CircleAlert, Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Metric } from "@/lib/data";
import { cn } from "@/lib/utils";

const STATUS: Record<
  string,
  { label: string; tone: string; icon: boolean }
> = {
  known_issue: {
    label: "Відома проблема",
    tone: "text-[var(--status-critical)]",
    icon: true,
  },
  needs_decision: {
    label: "Потребує рішення",
    tone: "text-[var(--status-warning)]",
    icon: true,
  },
};

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-xs leading-relaxed">{children}</dd>
    </div>
  );
}

/** Один блок довідки. На панелі з кількома метриками їх кілька поспіль. */
function MetricBlock({ metric }: { metric: Metric }) {
  const flag = metric.status ? STATUS[metric.status] : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{metric.label}</div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {metric.id}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {metric.definition}
      </p>

      {flag && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed",
            flag.tone
          )}
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="font-medium">{flag.label}</span>
        </div>
      )}

      <dl className="flex flex-col gap-2 border-t pt-3">
        {metric.formula && (
          <Row term="Як рахується">
            <span className="text-muted-foreground">{metric.formula}</span>
          </Row>
        )}
        {metric.grain && (
          <Row term="Грануляція">
            <span className="font-mono text-[11px] text-muted-foreground">
              {metric.grain}
            </span>
          </Row>
        )}
        {metric.source && (
          <Row term="Джерело">
            <span className="font-mono text-[11px] text-muted-foreground">
              {metric.source}
            </span>
          </Row>
        )}
        {/* `owner` свідомо НЕ показуємо: скрізь «Артем», рядок нічого не
            додає й лише шумить. У реєстрі поле лишається — воно потрібне,
            щоб знати, до кого йти зі спірним визначенням. */}
      </dl>

      {metric.note && (
        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          {metric.note}
        </p>
      )}
    </div>
  );
}

/**
 * Довідка по метриці — клік на заголовок картки.
 *
 * Сенс: дашборд шериться людям, які не сиділи в даних. «STAR 7,7%» без
 * пояснення — це число, якому нема причин довіряти. Тут відповідь на місці:
 * що це, як рахується, хто вирішує спірні питання і чи є з метрикою відомі
 * проблеми. Останнє показується ЗАВЖДИ і помітно — тиха метрика з багом
 * гірша за її відсутність.
 *
 * Метрик може бути КІЛЬКА: на одному графіку часто три ряди («Потенційні,
 * підтверджені та відвідувачі»), і кожен має власне визначення. Одна довідка
 * на панель із трьома рядами описувала б лише один із них — це гірше, ніж
 * відсутність довідки, бо виглядає як повне пояснення.
 */
export function MetricInfo({ metrics }: { metrics: Metric[] }) {
  if (!metrics.length) return null;

  // Іконка-попередження, якщо ХОЧ ОДНА метрика панелі має проблему: інакше
  // відома проблема ховається за нейтральним «i» просто тому, що поруч є
  // здорова метрика.
  const flagged = metrics.find((m) => m.status && STATUS[m.status]?.icon);
  const flag = flagged?.status ? STATUS[flagged.status] : undefined;
  const aria =
    metrics.length === 1
      ? `Про метрику «${metrics[0].label}»`
      : `Про метрики: ${metrics.map((m) => m.label).join(", ")}`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={aria}
            className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {flag?.icon ? (
              <CircleAlert className={cn("size-3.5", flag.tone)} />
            ) : (
              <Info className="size-3.5" />
            )}
          </button>
        }
      />

      <PopoverContent
        align="start"
        className="max-h-[70vh] w-[360px] gap-4 overflow-y-auto p-4"
      >
        {metrics.map((m, i) => (
          <div
            key={m.id}
            className={cn("flex flex-col gap-3", i > 0 && "border-t pt-4")}
          >
            <MetricBlock metric={m} />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
