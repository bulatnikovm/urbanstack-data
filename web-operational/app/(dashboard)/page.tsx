import { getOverviewPeriod } from "@/lib/data";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
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

export default async function OverviewPage({
  searchParams,
}: PageProps<"/">) {
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
  } = getOverviewPeriod(sp);

  const complexes = byComplex(curKey).sort(
    (a, b) => b.n_users_total - a.n_users_total
  );

  const curRate = rate(cur.n_users_confirmed, cur.n_users_total);
  const prevRate = rate(prev.n_users_confirmed, prev.n_users_total);

  return (
    <>
      <PageHeader
        title="Огляд ЖК"
        subtitle="Скільки в нас будинків, квартир і мешканців — по компанії і в розрізі ЖК"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Будинків"
            value={n(cur.n_houses_active)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: `${cur.n_houses_active - prev.n_houses_active >= 0 ? "+" : "−"}${Math.abs(cur.n_houses_active - prev.n_houses_active)}`,
              good: cur.n_houses_active >= prev.n_houses_active,
            }}
          />
          <Kpi
            label="Квартир"
            value={n(cur.n_apartments)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(cur.n_apartments / Math.max(prev.n_apartments, 1) - 1),
              good: cur.n_apartments >= prev.n_apartments,
            }}
          />
          <Kpi
            label="Користувачів"
            value={n(cur.n_users_total)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(cur.n_users_total / Math.max(prev.n_users_total, 1) - 1),
              good: cur.n_users_total >= prev.n_users_total,
            }}
          />
          <Kpi
            label="Підтверджені"
            value={pct(curRate)}
            sub={`${n(cur.n_users_confirmed)} користувачів`}
            trend={{ text: pp(curRate - prevRate), good: curRate >= prevRate }}
          />
        </div>

        <Section
          title="База по компанії"
          lead={
            <>
              У {monthLabel(curKey)} компанія обслуговує{" "}
              <Hl>{n(cur.n_houses_active)}</Hl> будинків із{" "}
              <Hl>{n(cur.n_apartments)}</Hl> квартирами. Користувачів —{" "}
              <Hl>{n(cur.n_users_total)}</Hl>, з них підтверджено{" "}
              <Hl>{pct(curRate)}</Hl>. Рахується з тієї самої моделі
              виключень, що й на продуктовому дашборді.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Будинків"
              note="Активні житлові будинки на кінець місяця, point-in-time по deactivated_at — деактивовані не рахуються навіть заднім числом."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  houses: r.n_houses_active,
                }))}
                series={[{ key: "houses", label: "Будинків", slot: 1 }]}
              />
            </Panel>

            <Panel
              title="Приміщення"
              note="Квартири, паркомісця та комерція — той самий point-in-time фільтр, що й будинки."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  apartments: r.n_apartments,
                  parking: r.n_parking,
                  commercial: r.n_commercial,
                }))}
                series={[
                  { key: "apartments", label: "Квартири", slot: 1 },
                  { key: "parking", label: "Паркінг", slot: 2 },
                  { key: "commercial", label: "Комерція", slot: 3 },
                ]}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Користувачі"
          lead="Загальна база проти підтвердженої — верифіковані й не деактивовані ні як роль, ні через вихід будинку з-під управління."
        >
          <Panel
            title="Користувачі — динаміка"
            metric={["Користувачів", "Підтверджені"]}
          >
            <BklitLine
              aspectRatio="3 / 1"
              data={inWindow(base).map((r) => ({
                month: r.report_month_key,
                total: r.n_users_total,
                confirmed: r.n_users_confirmed,
              }))}
              series={[
                { key: "total", label: "Усього", slot: 1 },
                { key: "confirmed", label: "Підтверджені", slot: 2 },
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Розріз по ЖК"
          lead={`${monthLabel(curKey)}, відсортовано за кількістю користувачів. Комплекси без жодного будинку, квартири чи користувача в цьому місяці приховані — це QA/тестові записи, а не втрачені дані.`}
        >
          <Panel
            title="Житлові комплекси"
            metric="Розріз по ЖК"
            note="Севен може мати 0 будинків, але ненульових користувачів — паркінг-будинок лишається активним, коли житлові вже деактивовані."
            action={
              <ExportXlsx
                fileName={`urbanstack-overview-${curKey}`}
                sheetName="Огляд ЖК"
                sheet={buildSheet(complexes, [
                  { header: "ЖК", value: (c) => c.complex_name, width: 26 },
                  { header: "Будинків", value: (c) => c.n_houses_active },
                  { header: "Квартир", value: (c) => c.n_apartments },
                  { header: "Паркінг", value: (c) => c.n_parking },
                  { header: "Комерція", value: (c) => c.n_commercial },
                  { header: "Користувачів", value: (c) => c.n_users_total },
                  {
                    header: "Підтверджені",
                    value: (c) => rate(c.n_users_confirmed, c.n_users_total),
                    format: "0.0%",
                    width: 14,
                  },
                ])}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ЖК</TableHead>
                  <TableHead className="text-right">Будинків</TableHead>
                  <TableHead className="text-right">Квартир</TableHead>
                  <TableHead className="text-right">Користувачів</TableHead>
                  <TableHead className="text-right">Підтверджені</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complexes.map((c) => (
                  <TableRow key={c.complex_id}>
                    <TableCell className="font-medium">
                      {c.complex_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.n_houses_active)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.n_apartments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.n_users_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(rate(c.n_users_confirmed, c.n_users_total))}
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
