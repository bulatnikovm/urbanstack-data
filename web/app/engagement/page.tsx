import {
  getEngagement,
  getModuleRetention,
  getModuleUsage,
  getPeriod,
  getUserSegments,
  stripOrder,
} from "@/lib/data";
import { delta, monthLabel, n, n1, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  Hl,
  Kpi,
  PageBody,
  Panel,
  Section,
} from "@/components/dashboard";
import { TrendLines } from "@/components/trend-charts";
import { RankedBars } from "@/components/ranked-bars";
import { BklitDonut } from "@/components/bklit-donut";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function EngagementPage({ searchParams }: PageProps<"/engagement">) {
  const sp = await searchParams;
  const { curKey, prevKey, isPartial, daysElapsed, daysInMonth, bounds, range, inWindow, at } = getPeriod(sp);

  const eng = getEngagement();
  const engCur = at(eng, curKey)!;
  const engPrev = at(eng, prevKey)!;

  const modules = getModuleUsage()
    .filter((r) => r.report_month_key === curKey)
    .sort((a, b) => b.penetration_rate - a.penetration_rate);

  const dropOff = getModuleRetention()
    .slice()
    .sort((a, b) => b.true_module_drop_off_rate - a.true_module_drop_off_rate);

  // Снепшот сегментів × версія × ОС. Крос-таблиця 5×2×2 не читалась —
  // розкладено на дві незалежні агрегації, кожна відповідає на своє питання.
  const segments = getUserSegments();

  const bySegment = new Map<string, number>();
  for (const r of segments) {
    bySegment.set(
      r.activity_segment,
      (bySegment.get(r.activity_segment) ?? 0) + r.users_count
    );
  }
  const segmentRows = [...bySegment.entries()]
    .map(([label, value]) => ({ label: stripOrder(label), value, order: label }))
    .sort((a, b) => a.order.localeCompare(b.order));
  const segmentTotal = [...bySegment.values()].reduce((a, b) => a + b, 0);

  const byVersion = new Map<string, number>();
  for (const r of segments) {
    byVersion.set(
      r.version_status,
      (byVersion.get(r.version_status) ?? 0) + r.users_count
    );
  }
  const versionRows = [...byVersion.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const versionTotal = [...byVersion.values()].reduce((a, b) => a + b, 0);
  const activeShare = segmentTotal
    ? (bySegment.get("1. Активні (< 1 міс)") ?? 0) / segmentTotal
    : 0;

  return (
    <>
      <PageHeader
        title="Залученість"
        subtitle="Чим саме користуються і де відвалюються"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Середній денний актив"
            value={n(engCur.avg_daily_core_users)}
            sub="користувачів із цільовою дією на день"
            trend={{
              text: delta(
                engCur.avg_daily_core_users / engPrev.avg_daily_core_users - 1
              ),
              good: engCur.avg_daily_core_users >= engPrev.avg_daily_core_users,
            }}
          />
          <Kpi
            label="Медіанна сесія"
            value={`${n1(engCur.median_session_min)} хв`}
            sub={`P90 ${n1(engCur.p90_session_min)} хв`}
            trend={{
              text: delta(
                engCur.median_session_min / engPrev.median_session_min - 1
              ),
              good: engCur.median_session_min >= engPrev.median_session_min,
            }}
          />
          <Kpi
            label="Час у додатку за місяць"
            value={`${n1(engCur.median_user_time_min)} хв`}
            sub="медіана на користувача"
            trend={{
              text: delta(
                engCur.median_user_time_min / engPrev.median_user_time_min - 1
              ),
              good: engCur.median_user_time_min >= engPrev.median_user_time_min,
            }}
          />
          <Kpi
            label="Сесій за місяць"
            value={n(engCur.n_sessions)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(engCur.n_sessions / engPrev.n_sessions - 1),
              good: engCur.n_sessions >= engPrev.n_sessions,
            }}
          />
        </div>

        <Section
          title="Цільові сценарії"
          lead={
            <>
              Екран голосування відкрили{" "}
              <Hl>{n(engCur.voting_saw_users)}</Hl> користувачів, до самого
              голосу дійшли <Hl>{n(engCur.voting_voted_users)}</Hl> —{" "}
              <Hl>{pct(engCur.voting_conversion_rate)}</Hl> конверсії (
              {pp(engCur.voting_conversion_rate - engPrev.voting_conversion_rate)}{" "}
              за місяць). Кнопку «Створити заявку» натиснули{" "}
              <Hl>{n(engCur.app_requests_created_users)}</Hl> користувачів, з
              них <Hl>{n(engCur.app_paid_requests_created_users)}</Hl> — по
              платній послузі.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Голосування: відкрили → проголосували"
              note="«Відкрили» — зайшли на екран голосування (не «побачили десь у стрічці»). Конверсія — частка тих, хто дійшов до самого натискання «Проголосувати»."
            >
              <TrendLines
                data={inWindow(eng).map((r) => ({
                  month: r.report_month_key,
                  saw: r.voting_saw_users,
                  voted: r.voting_voted_users,
                }))}
                series={[
                  { key: "saw", label: "Відкрили", slot: 1 },
                  { key: "voted", label: "Проголосували", slot: 2 },
                ]}
              />
            </Panel>

            <Panel
              title="Натиснули «Створити заявку»"
              note="⚠️ Це натискання кнопки в застосунку (Amplitude), а не підтверджено створена заявка і не рядок у CRM. Операційна метрика заявок (усі канали) рахується окремо й буде більшою."
            >
              <TrendLines
                data={inWindow(eng).map((r) => ({
                  month: r.report_month_key,
                  requests: r.app_requests_created_users,
                  paid: r.app_paid_requests_created_users,
                }))}
                series={[
                  { key: "requests", label: "Безкоштовна", slot: 1 },
                  { key: "paid", label: "Платна послуга", slot: 2 },
                ]}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Модулі"
          lead={
            modules[0] && dropOff[0] ? (
              <>
                Найширше покриття в{" "}
                <Hl>{stripOrder(modules[0].module_name_ua)}</Hl> —{" "}
                <Hl>{pct(modules[0].penetration_rate)}</Hl> користувачів. Найбільший
                відвал у модулі{" "}
                <Hl>{stripOrder(dropOff[0].module_name_ua)}</Hl>:{" "}
                <Hl>{pct(dropOff[0].true_module_drop_off_rate)}</Hl> тих, хто його
                спробував, більше не повертаються.
              </>
            ) : undefined
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title={`Покриття модулів — ${monthLabel(curKey)}`}
              note="Частка користувачів, які торкнулись модуля за місяць."
            >
              <RankedBars
                data={modules.map((r) => ({
                  label: stripOrder(r.module_name_ua),
                  value: r.penetration_rate,
                }))}
              />
            </Panel>

            <Panel
              title="Відвал за модулями"
              note="Частка тих, хто спробував модуль і більше не повернувся у вікно спостереження."
            >
              <RankedBars
                data={dropOff.map((r) => ({
                  label: stripOrder(r.module_name_ua),
                  value: r.true_module_drop_off_rate,
                }))}
              />
            </Panel>
          </div>

          <Panel
            title="Модулі в деталях"
            note="Час у модулі й скільки днів минає до відвалу."
          >
            <div className="max-h-[440px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Модуль</TableHead>
                    <TableHead className="text-right">Користувачів</TableHead>
                    <TableHead className="text-right">Покриття</TableHead>
                    <TableHead className="text-right">Медіанний час</TableHead>
                    <TableHead className="text-right">Відвал</TableHead>
                    <TableHead className="text-right">Днів до відвалу</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modules.map((m) => {
                    const d = dropOff.find(
                      (x) => x.module_name_ua === m.module_name_ua
                    );
                    return (
                      <TableRow key={m.module_code}>
                        <TableCell className="font-medium">
                          {stripOrder(m.module_name_ua)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(m.module_users)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(m.penetration_rate, 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {n1(m.median_time_min)} хв
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d ? pct(d.true_module_drop_off_rate, 0) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {d ? n(d.median_days_before_drop) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </Section>

        <Section
          title="Сегменти й версія додатку"
          lead={
            versionTotal > 0 ? (
              <>
                На актуальній версії додатку —{" "}
                <Hl>
                  {pct((byVersion.get("Актуальна версія") ?? 0) / versionTotal)}
                </Hl>{" "}
                користувачів; решта сидить на застарілій збірці, і на них не
                діють останні зміни в продукті.{" "}
                <Hl>{pct(activeShare)}</Hl> підтверджених — активні (заходили
                за останній місяць). Знімок на поточний момент, не помісячний.
              </>
            ) : undefined
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Сегменти за активністю"
              note="Останній заміряний вхід у застосунок відносно сьогодні."
            >
              <RankedBars
                kind="int"
                highlightTop={1}
                data={segmentRows}
              />
            </Panel>

            <Panel
              title="Версія застосунку"
              note="Актуальна — та сама версія, що й у найпопулярнішого сегмента за останні 7 днів."
            >
              <BklitDonut data={versionRows} centerLabel="Користувачів" />
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
