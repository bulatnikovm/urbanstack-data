import {
  getEngagement,
  getModuleRetention,
  getModuleUsage,
  getPeriod,
  getUserSegments,
  getUtilityReceipts,
  stripOrder,
} from "@/lib/data";
import { delta, monthLabel, n, n1, pct, pp, uah } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  Hl,
  Kpi,
  PageBody,
  Panel,
  Section,
} from "@/components/dashboard";
import { BklitLine } from "@/components/bklit-line";
import { RankedBars } from "@/components/ranked-bars";
import { BklitDonut } from "@/components/bklit-donut";
import { ExportXlsx } from "@/components/export-xlsx";
import { buildSheet } from "@/lib/xlsx";
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

  // ⚠️ Не Amplitude — банківські транзакції (dbt_finance.stg_finance__transactions,
  // крос-доменний ref). Оплата йде через сторонній платіжний шлюз, застосунок
  // цього не бачить. Формула звірена з дашбордом (Микита, 2026-08-06):
  // transaction_type='utilities', accepted/rejected (new — незавершені спроби).
  const receipts = getUtilityReceipts();
  const recCur = at(receipts, curKey)!;
  const recPrev = at(receipts, prevKey)!;
  const recCurTotal = recCur.receipts_accepted + recCur.receipts_rejected;

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
              <BklitLine
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
              <BklitLine
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
          title="Квитанції за комунальні послуги"
          lead={
            <>
              Оплачено <Hl>{n(recCur.receipts_accepted)}</Hl> квитанцій на{" "}
              <Hl>{uah(recCur.receipts_accepted_amount)}</Hl>,{" "}
              <Hl>{n(recCur.receipts_rejected)}</Hl> відхилено банком —{" "}
              <Hl>{pct(recCur.receipts_rejected_rate)}</Hl> від усіх спроб (
              {pp(recCur.receipts_rejected_rate - recPrev.receipts_rejected_rate)}{" "}
              за місяць).
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Сума прийнятих"
              value={uah(recCur.receipts_accepted_amount)}
              sub={`середній чек ${uah(recCur.receipts_accepted_avg_amount)}`}
              trend={{
                text: delta(
                  recCur.receipts_accepted_amount /
                    recPrev.receipts_accepted_amount -
                    1
                ),
                good:
                  recCur.receipts_accepted_amount >=
                  recPrev.receipts_accepted_amount,
              }}
            />
            <Kpi
              label="Прийнято квитанцій"
              value={n(recCur.receipts_accepted)}
              sub={`з ${n(recCurTotal)} спроб`}
              trend={{
                text: delta(
                  recCur.receipts_accepted / recPrev.receipts_accepted - 1
                ),
                good: recCur.receipts_accepted >= recPrev.receipts_accepted,
              }}
            />
            <Kpi
              label="Відхилено банком"
              value={n(recCur.receipts_rejected)}
              sub={pct(recCur.receipts_rejected_rate) + " від спроб"}
              trend={{
                text: pp(
                  recCur.receipts_rejected_rate -
                    recPrev.receipts_rejected_rate
                ),
                good:
                  recCur.receipts_rejected_rate <=
                  recPrev.receipts_rejected_rate,
              }}
            />
            <Kpi
              label="Середній чек"
              value={uah(recCur.receipts_accepted_avg_amount)}
              sub={`було ${uah(recPrev.receipts_accepted_avg_amount)}`}
              trend={{
                text: delta(
                  recCur.receipts_accepted_avg_amount /
                    recPrev.receipts_accepted_avg_amount -
                    1
                ),
                good:
                  recCur.receipts_accepted_avg_amount >=
                  recPrev.receipts_accepted_avg_amount,
              }}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Прийнято vs відхилено" note="Банківські транзакції, не подія застосунку.">
              <BklitLine
                data={inWindow(receipts).map((r) => ({
                  month: r.report_month_key,
                  accepted: r.receipts_accepted,
                  rejected: r.receipts_rejected,
                }))}
                series={[
                  { key: "accepted", label: "Прийнято", slot: 1 },
                  { key: "rejected", label: "Відхилено", slot: 2 },
                ]}
              />
            </Panel>

            <Panel title="Сума оплачених квитанцій">
              <BklitLine
                kind="money"
                data={inWindow(receipts).map((r) => ({
                  month: r.report_month_key,
                  amount: r.receipts_accepted_amount,
                }))}
                series={[{ key: "amount", label: "Сума", slot: 1 }]}
              />
            </Panel>

            <Panel title="Частка відхилених">
              <BklitLine
                kind="pct"
                data={inWindow(receipts).map((r) => ({
                  month: r.report_month_key,
                  rate: r.receipts_rejected_rate,
                }))}
                series={[{ key: "rate", label: "Відхилено", slot: 2 }]}
              />
            </Panel>
          </div>

          <Panel
            title="Квитанції за місяцями"
            note="⚠️ transaction_type='utilities', accepted/rejected; незавершені спроби (new) не рахуються."
            action={
              <ExportXlsx
                fileName="urbanstack-kvytantsii"
                sheetName="Квитанції"
                sheet={buildSheet(inWindow(receipts).slice().reverse(), [
                  {
                    header: "Місяць",
                    value: (r) => monthLabel(r.report_month_key),
                    width: 14,
                  },
                  {
                    header: "Сума прийнятих, ₴",
                    value: (r) => r.receipts_accepted_amount,
                    format: "#,##0.00",
                    width: 20,
                  },
                  { header: "Успішних", value: (r) => r.receipts_accepted },
                  { header: "Відхилених", value: (r) => r.receipts_rejected },
                  {
                    header: "% відхилених",
                    value: (r) => r.receipts_rejected_rate,
                    format: "0.0%",
                  },
                  {
                    header: "Середній чек, ₴",
                    value: (r) => r.receipts_accepted_avg_amount,
                    format: "#,##0.00",
                    width: 18,
                  },
                ])}
              />
            }
          >
            <div className="max-h-[360px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Місяць</TableHead>
                    <TableHead className="text-right">Сума прийнятих</TableHead>
                    <TableHead className="text-right">Успішних</TableHead>
                    <TableHead className="text-right">Відхилених</TableHead>
                    <TableHead className="text-right">% відхилених</TableHead>
                    <TableHead className="text-right">Середній чек</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inWindow(receipts)
                    .slice()
                    .reverse()
                    .map((r) => (
                      <TableRow key={r.report_month_key}>
                        <TableCell className="font-medium">
                          {monthLabel(r.report_month_key)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {uah(r.receipts_accepted_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.receipts_accepted)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.receipts_rejected)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(r.receipts_rejected_rate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {uah(r.receipts_accepted_avg_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
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
            action={
              <ExportXlsx
                fileName={`urbanstack-moduli-${curKey}`}
                sheetName="Модулі"
                sheet={buildSheet(modules, [
                  {
                    header: "Модуль",
                    value: (m) => stripOrder(m.module_name_ua),
                    width: 26,
                  },
                  { header: "Користувачів", value: (m) => m.module_users },
                  {
                    header: "Покриття",
                    value: (m) => m.penetration_rate,
                    format: "0.0%",
                  },
                  {
                    header: "Медіанний час, хв",
                    value: (m) => m.median_time_min,
                    format: "0.0",
                    width: 18,
                  },
                  {
                    header: "Відвал",
                    value: (m) =>
                      dropOff.find((x) => x.module_name_ua === m.module_name_ua)
                        ?.true_module_drop_off_rate,
                    format: "0.0%",
                  },
                  {
                    header: "Днів до відвалу",
                    value: (m) =>
                      dropOff.find((x) => x.module_name_ua === m.module_name_ua)
                        ?.median_days_before_drop,
                    width: 18,
                  },
                ])}
              />
            }
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
