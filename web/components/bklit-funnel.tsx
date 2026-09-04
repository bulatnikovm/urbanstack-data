"use client";

import { FunnelChart } from "@/components/charts/funnel-chart";
import { n } from "@/lib/format";

/**
 * Воронка — обгортка над bklit `FunnelChart` (реєстр `@bklit`, ставиться
 * `npx shadcn add @bklit/funnel-chart`). Той самий прийом, що в
 * `bklit-line` / `bklit-donut`: компонент з реєстру як є, а тут — наші
 * формати й дефолти в одному місці.
 *
 * ⚠️ Обгортка потрібна не для краси: `formatValue` за замовчуванням у
 * компонента — `Intl.NumberFormat("en-US")`, тобто «25,882». По всьому
 * дашборду числа українські («25 882»), і без цієї підміни воронка була б
 * єдиним місцем з іншим розділювачем розрядів.
 *
 * ⚠️ І саме тому обгортка КЛІЄНТСЬКА: `formatValue` — функція, а функції не
 * переїжджають через межу RSC. Сторінки в нас серверні, тож передати
 * форматер напряму зі сторінки не можна — тільки звідси.
 *
 * Відсотки лишаємо на дефолті (ціле число, «56%»): саме так на макеті, і
 * десятий знак у наскрізній частці воронки нічого не додає.
 */
export function BklitFunnel({
  steps,
  layers = 3,
}: {
  steps: Array<{ label: string; value: number }>;
  /** Скільки концентричних «гало» малювати навколо стрічки. */
  layers?: number;
}) {
  return (
    <FunnelChart
      data={steps}
      color="var(--chart-1)"
      layers={layers}
      formatValue={n}
    />
  );
}
