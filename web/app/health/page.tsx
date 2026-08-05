import { getPeriod } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PageBody, Panel } from "@/components/dashboard";

/**
 * Стор. 5 оригінального дашборду — технічний стан додатку (логаути по
 * ОС/версії, біометрія, чистий відтік). Дані вже вивантажені
 * (`mart_app_health_weekly`, 2 416 рядків), лишилось розкласти по графіках.
 * Свідомо відкладено — Микита позначив цю сторінку як «можна на потім».
 */
export default async function HealthPage({ searchParams }: PageProps<"/health">) {
  const sp = await searchParams;
  const { curKey, isPartial, daysElapsed, daysInMonth, bounds, range } = getPeriod(sp);

  return (
    <>
      <PageHeader
        title="Стан додатку"
        subtitle="Логаути, біометрія, технічний відтік"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />
      <PageBody>
        <Panel
          title="Сторінка в роботі"
          note="Стор. 5 оригінального дашборду."
        >
          <p className="px-1 py-6 text-sm leading-relaxed text-muted-foreground">
            Дані для цієї сторінки вже вивантажені —{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              mart_app_health_weekly
            </code>{" "}
            (2 416 рядків: тижневий актив, примусові логаути, біометрія й
            fallback на PIN у розрізі ОС і версії додатку). Лишилось розкласти
            по графіках — відкладено за домовленістю.
          </p>
        </Panel>
      </PageBody>
    </>
  );
}
