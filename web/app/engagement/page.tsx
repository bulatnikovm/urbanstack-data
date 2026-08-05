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
  PartialMonthNote,
  Section,
} from "@/components/dashboard";
import { TrendLines } from "@/components/trend-charts";
import { RankedBars } from "@/components/ranked-bars";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function EngagementPage() {
  const { curKey, prevKey, partialKey, inWindow, at } = getPeriod();

  const eng = getEngagement();
  const engCur = at(eng, curKey)!;
  const engPrev = at(eng, prevKey)!;

  const modules = getModuleUsage()
    .filter((r) => r.report_month_key === curKey)
    .sort((a, b) => b.penetration_rate - a.penetration_rate);

  const dropOff = getModuleRetention()
    .slice()
    .sort((a, b) => b.true_module_drop_off_rate - a.true_module_drop_off_rate);

  // Сегмент × статус версії — скільки активних сидить на застарілому додатку
  const segments = getUserSegments();
  const byVersion = new Map<string, number>();
  for (const r of segments) {
    byVersion.set(
      r.version_status,
      (byVersion.get(r.version_status) ?? 0) + r.users_count
    );
  }
  const versionTotal = [...byVersion.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Залученість"
        subtitle="Чим саме користуються і де відвалюються"
        monthKey={curKey}
      />

      <PageBody>
        {partialKey && <PartialMonthNote monthLabel={monthLabel(partialKey)} />}

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
              Голосування побачили <Hl>{n(engCur.voting_saw_users)}</Hl>{" "}
              користувачів, проголосували{" "}
              <Hl>{n(engCur.voting_voted_users)}</Hl> —{" "}
              <Hl>{pct(engCur.voting_conversion_rate)}</Hl> конверсії (
              {pp(engCur.voting_conversion_rate - engPrev.voting_conversion_rate)}{" "}
              за місяць). Заявку через додаток створили{" "}
              <Hl>{n(engCur.app_requests_created_users)}</Hl> користувачів, з них{" "}
              <Hl>{n(engCur.app_paid_requests_created_users)}</Hl> — платну.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Голосування: побачили → проголосували"
              note="Скільки користувачів побачили голосування і скільки дійшли до голосу."
            >
              <TrendLines
                data={inWindow(eng).map((r) => ({
                  month: r.report_month_key,
                  saw: r.voting_saw_users,
                  voted: r.voting_voted_users,
                }))}
                series={[
                  { key: "saw", label: "Побачили", slot: 1 },
                  { key: "voted", label: "Проголосували", slot: 2 },
                ]}
              />
            </Panel>

            <Panel
              title="Заявки, створені в додатку"
              note="Це намір у застосунку (Amplitude), а не рядок у CRM — операційна метрика заявок рахується інакше і буде більшою."
            >
              <TrendLines
                data={inWindow(eng).map((r) => ({
                  month: r.report_month_key,
                  requests: r.app_requests_created_users,
                  paid: r.app_paid_requests_created_users,
                }))}
                series={[
                  { key: "requests", label: "Створили заявку", slot: 1 },
                  { key: "paid", label: "Створили платну", slot: 2 },
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
                користувачів. Решта сидить на застарілій збірці, і на них не
                діють останні зміни в продукті.
              </>
            ) : undefined
          }
        >
          <Panel
            title="Активність × версія × ОС"
            note="Зріз на поточний момент, не помісячний."
          >
            <div className="max-h-[360px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Сегмент</TableHead>
                    <TableHead>Версія</TableHead>
                    <TableHead>ОС</TableHead>
                    <TableHead className="text-right">Користувачів</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segments
                    .slice()
                    .sort((a, b) => b.users_count - a.users_count)
                    .map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {s.activity_segment}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.version_status}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.os_type}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(s.users_count)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
