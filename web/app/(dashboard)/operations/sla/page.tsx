import {
  getSlaPeriod,
  getSlaYearly,
  getStatusTotals,
  type SlaMonthly,
} from "@/lib/data-operational";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { BklitBar } from "@/components/bklit-bar";
import { BklitDonut } from "@/components/bklit-donut";
import { BklitLine } from "@/components/bklit-line";
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

const rate = (part: number, total: number) => (total > 0 ? part / total : 0);

/**
 * Укрупнення сирого статусу заявки в три групи, які показував старий пончик.
 * Пʼять сирих значень (completed / canceled / in_progress / consideration /
 * new) для читача нічого не додають: «розгляд» і «нова» — та сама відповідь
 * «ще в роботі».
 */
const STATUS_GROUP: Record<string, string> = {
  completed: "Виконано",
  canceled: "Скасовано",
  cancelled: "Скасовано",
  rejected: "Скасовано",
};
const statusGroup = (s: string) => STATUS_GROUP[s] ?? "В роботі";

export default async function SlaPage({ searchParams }: PageProps<"/operations/sla">) {
  const sp = await searchParams;
  const {
    curKey,
    prevKey,
    isPartial,
    daysElapsed,
    daysInMonth,
    bounds,
    range,
    cur,
    prev,
    base,
    inWindow,
    byComplex,
  } = getSlaPeriod(sp);

  const complexes = byComplex(curKey).sort(
    (a, b) => b.created_count - a.created_count
  );

  const curSameMonth = rate(cur.completed_same_month_count, cur.created_count);
  const prevSameMonth = rate(prev.completed_same_month_count, prev.created_count);
  const curCancel = rate(cur.canceled_count, cur.created_count);
  const prevCancel = rate(prev.canceled_count, prev.created_count);

  // Пончик статусів — за весь час, без розрізу місяця (як у старому звіті).
  const statusRows = getStatusTotals();
  const byStatus = new Map<string, number>();
  for (const r of statusRows) {
    const g = statusGroup(r.status);
    byStatus.set(g, (byStatus.get(g) ?? 0) + r.order_count);
  }
  const donut = [...byStatus.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const allTime = donut.reduce((a, d) => a + d.value, 0);

  // По роках: рядки — рік, у розрізі ЖК лишається таблиця нижче.
  const yearlyRaw = getSlaYearly();
  const byYear = new Map<
    number,
    { created: number; completed: number; canceled: number; inProgress: number }
  >();
  for (const r of yearlyRaw) {
    const acc = byYear.get(r.report_year) ?? {
      created: 0,
      completed: 0,
      canceled: 0,
      inProgress: 0,
    };
    acc.created += r.created_count;
    acc.completed += r.completed_count;
    acc.canceled += r.canceled_count;
    acc.inProgress += r.in_progress_count;
    byYear.set(r.report_year, acc);
  }
  // Роки без жодної заявки відкидаємо: календарний спайн mart'а починається
  // з 2021, а перша заявка в CRM — квітень 2022, і порожній рядок «2021 · 0 ·
  // 0 · 0,0%» читається як втрачені дані, а не як «системи тоді не було».
  const years = [...byYear.entries()]
    .map(([year, v]) => ({ year, ...v }))
    .filter((y) => y.created > 0)
    .sort((a, b) => a.year - b.year);

  // Найшвидший і найповільніший ЖК місяця — для ліда секції «Розріз по ЖК».
  const ranked = complexes
    .filter((c) => c.created_count >= 20)
    .map((c) => ({
      ...c,
      sameMonth: rate(c.completed_same_month_count, c.created_count),
    }))
    .sort((a, b) => b.sameMonth - a.sameMonth);
  const best = ranked[0];
  const worst = ranked.at(-1);

  const backlogPeak = [...inWindow(base)].sort(
    (a, b) => b.backlog_end_of_month - a.backlog_end_of_month
  )[0];

  return (
    <>
      <PageHeader
        title="Операційна ефективність"
        subtitle="Скільки заявок подають, скільки закриваємо і що лишається в черзі"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Створено заявок"
            value={n(cur.created_count)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(cur.created_count / Math.max(prev.created_count, 1) - 1),
              // Зростання потоку заявок — не «добре»: більше звернень означає
              // більше проблем у будинках, а не кращу роботу.
              good: null,
            }}
          />
          <Kpi
            label="Виконано заявок"
            value={n(cur.completed_count)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(
                cur.completed_count / Math.max(prev.completed_count, 1) - 1
              ),
              good: cur.completed_count >= prev.completed_count,
            }}
          />
          <Kpi
            label="Закрито того ж місяця"
            value={pct(curSameMonth)}
            sub={`${n(cur.completed_same_month_count)} заявок`}
            trend={{
              text: pp(curSameMonth - prevSameMonth),
              good: curSameMonth >= prevSameMonth,
            }}
          />
          <Kpi
            label="Скасовано заявок"
            value={pct(curCancel)}
            sub={`${n(cur.canceled_count)} заявок`}
            trend={{
              text: pp(curCancel - prevCancel),
              good: curCancel <= prevCancel,
            }}
          />
        </div>

        <Section
          title="Потік і швидкість"
          lead={
            <>
              У {monthLabel(curKey)} мешканці подали{" "}
              <Hl>{n(cur.created_count)}</Hl> заявок, компанія закрила{" "}
              <Hl>{n(cur.completed_count)}</Hl>. З поданих цього ж місяця
              встигли закрити <Hl>{pct(curSameMonth)}</Hl> — це і є швидкість
              «по гарячому». Друга цифра, «закрито / подано», може заходити за
              100%: у такі місяці розбирали накопичену чергу, а не встигали
              краще.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Потік заявок"
              note="Створено — за датою подачі, виконано — за датою закриття. Тому лінії розходяться: це два різні моменти життя однієї заявки."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  created: r.created_count,
                  completed: r.completed_count,
                }))}
                series={[
                  { key: "created", label: "Створено", slot: 1 },
                  { key: "completed", label: "Виконано", slot: 2 },
                ]}
              />
            </Panel>

            <Panel
              title="Швидкість закриття"
              note="«Того ж місяця» за побудовою не перевищує 100%. «Закрито / подано» — може, і саме це показує роботу з чергою."
            >
              <BklitLine
                aspectRatio="2 / 1"
                kind="pct"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  same: rate(r.completed_same_month_count, r.created_count),
                  ratio: rate(r.completed_count, r.created_count),
                }))}
                series={[
                  { key: "same", label: "Того ж місяця", slot: 1 },
                  { key: "ratio", label: "Закрито / подано", slot: 2 },
                ]}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Черга"
          lead={
            <>
              На кінець {monthLabel(curKey)} незакритими лишались{" "}
              <Hl>{n(cur.backlog_end_of_month)}</Hl> заявок. Це наростаючий
              підсумок: усе, що подали, мінус усе, що закрили чи скасували, від
              самого запуску CRM.{" "}
              {backlogPeak && backlogPeak.report_month_key !== curKey && (
                <>
                  Пік у вибраному періоді —{" "}
                  <Hl>{n(backlogPeak.backlog_end_of_month)}</Hl> у{" "}
                  {monthLabel(backlogPeak.report_month_key)}.
                </>
              )}
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title="Незакритий залишок"
              note="Ряд рахується на повному календарі, а не лише на місяцях із заявками — інакше сходинка накопичення губилась би на порожніх місяцях."
            >
              <BklitLine
                aspectRatio="3 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  backlog: r.backlog_end_of_month,
                }))}
                series={[{ key: "backlog", label: "У черзі", slot: 1 }]}
              />
            </Panel>

            <Panel
              title="Статуси за весь час"
              note={`Усі ${n(allTime)} заявок з моменту запуску CRM. Тестові ЖК виключені — у старому звіті на цьому блоці фільтра не було взагалі.`}
              contentClassName="flex-1"
            >
              <BklitDonut
                data={donut}
                centerLabel="Заявок"
                maxSlices={3}
                size={196}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="По роках"
          lead={
            <>
              Рік фіксується датою ПОДАЧІ заявки. У старому звіті рік брався за
              датою закриття, і грудневі заявки, закриті в січні, переїжджали в
              наступний рік — «створено за рік» переставало бути кількістю
              створеного.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title="Заявки по роках"
              note="«Не закрито того ж року» — це не поточна черга: заявка з 2024, закрита у 2025, назавжди лишається тут у 2024."
            >
              <BklitBar
                aspectRatio="2 / 1"
                xKey="year"
                data={years.map((y) => ({
                  year: String(y.year),
                  created: y.created,
                  completed: y.completed,
                  canceled: y.canceled,
                }))}
                series={[
                  { key: "created", label: "Створено", slot: 1 },
                  { key: "completed", label: "Виконано", slot: 2 },
                  { key: "canceled", label: "Скасовано", slot: 3 },
                ]}
              />
            </Panel>

            <Panel title="Роки — таблиця" metric="Заявки по роках">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Рік</TableHead>
                    <TableHead className="text-right">Створено</TableHead>
                    <TableHead className="text-right">Виконано</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {years.map((y) => (
                    <TableRow key={y.year}>
                      <TableCell className="font-medium">{y.year}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(y.created)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(y.completed)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(rate(y.completed, y.created))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
        </Section>

        <Section
          title="Розріз по ЖК"
          lead={
            best && worst && best.complex_id !== worst.complex_id ? (
              <>
                У {monthLabel(curKey)} найшвидше закривав{" "}
                <Hl>{best.complex_name}</Hl> ({pct(best.sameMonth)} того ж
                місяця), найповільніше — <Hl>{worst.complex_name}</Hl> (
                {pct(worst.sameMonth)}). Порівнюються лише ЖК із 20+ заявками
                за місяць: на менших обсягах відсоток стрибає від однієї заявки.
              </>
            ) : (
              <>
                {monthLabel(curKey)}, відсортовано за кількістю поданих заявок.
              </>
            )
          }
        >
          <Panel
            title="Ефективність по ЖК"
            note="«У черзі» — наростаючий залишок ЖК на кінець місяця, а не заявки цього місяця."
            action={
              <ExportXlsx
                fileName={`urbanstack-sla-${curKey}`}
                sheetName="SLA по ЖК"
                sheet={buildSheet(complexes, [
                  { header: "ЖК", value: (c) => c.complex_name, width: 26 },
                  { header: "Створено", value: (c) => c.created_count },
                  { header: "Виконано", value: (c) => c.completed_count },
                  { header: "Скасовано", value: (c) => c.canceled_count },
                  {
                    header: "Того ж місяця",
                    value: (c: SlaMonthly) =>
                      rate(c.completed_same_month_count, c.created_count),
                    format: "0.0%",
                    width: 14,
                  },
                  { header: "У черзі", value: (c) => c.backlog_end_of_month },
                ])}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ЖК</TableHead>
                  <TableHead className="text-right">Створено</TableHead>
                  <TableHead className="text-right">Виконано</TableHead>
                  <TableHead className="text-right">Того ж місяця</TableHead>
                  <TableHead className="text-right">У черзі</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complexes.map((c) => (
                  <TableRow key={c.complex_id}>
                    <TableCell className="font-medium">
                      {c.complex_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.created_count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.completed_count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(rate(c.completed_same_month_count, c.created_count))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.backlog_end_of_month)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
