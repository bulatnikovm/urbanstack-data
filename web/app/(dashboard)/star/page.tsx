import { getPeriod, getStar, stripOrder } from "@/lib/data";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAR_TOTAL = "0. Всього активних";

export default async function StarPage({ searchParams }: PageProps<"/star">) {
  const sp = await searchParams;
  const { curKey, prevKey, isPartial, daysElapsed, daysInMonth, bounds, range, inWindow, at } = getPeriod(sp);

  const star = getStar();
  const total = star.filter((r) => r.star_category === STAR_TOTAL);
  const cur = at(total, curKey)!;
  const prev = at(total, prevKey)!;

  const cats = star
    .filter((r) => r.report_month_key === curKey && r.star_category !== STAR_TOTAL)
    .sort((a, b) => b.star_rate - a.star_rate);

  return (
    <>
      <PageHeader
        title="STAR"
        subtitle="North Star Metric — частка бази, що виконує цільову дію"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="STAR від підтверджених"
            value={pct(cur.star_rate_of_confirmed)}
            sub={`було ${pct(prev.star_rate_of_confirmed)}`}
            trend={{
              text: pp(cur.star_rate_of_confirmed - prev.star_rate_of_confirmed),
              good: cur.star_rate_of_confirmed >= prev.star_rate_of_confirmed,
            }}
          />
          <Kpi
            label="STAR від потенційних"
            value={pct(cur.star_rate)}
            sub={`було ${pct(prev.star_rate)}`}
            trend={{
              text: pp(cur.star_rate - prev.star_rate),
              good: cur.star_rate >= prev.star_rate,
            }}
          />
          <Kpi
            label="Користувачів із цільовою дією"
            value={n(cur.unique_users)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(cur.unique_users / prev.unique_users - 1),
              good: cur.unique_users >= prev.unique_users,
            }}
          />
          <Kpi
            label="Категорій у грі"
            value={n(cats.filter((c) => c.unique_users > 0).length)}
            sub={`з ${cats.length} можливих`}
          />
        </div>

        <Section
          title="North Star у часі"
          lead={
            <>
              У {monthLabel(curKey)} цільову дію виконали{" "}
              <Hl>{n(cur.unique_users)}</Hl> користувачів — це{" "}
              <Hl>{pct(cur.star_rate_of_confirmed)}</Hl> підтвердженої бази (
              {pp(cur.star_rate_of_confirmed - prev.star_rate_of_confirmed)} за
              місяць).{" "}
              {cats[0] && (
                <>
                  Найсильніша категорія —{" "}
                  <Hl>{stripOrder(cats[0].star_category)}</Hl>,{" "}
                  {pct(cats[0].star_rate)} потенційної бази.
                </>
              )}
            </>
          }
        >
          <Panel
            title="STAR — частка бази з цільовою дією"
            note="Дві бази порівняння: від усіх потенційних і від підтверджених користувачів."
          >
            <BklitLine
              aspectRatio="3 / 1"
              kind="pct"
              data={inWindow(total).map((r) => ({
                month: r.report_month_key,
                of_confirmed: r.star_rate_of_confirmed,
                of_potential: r.star_rate,
              }))}
              series={[
                { key: "of_confirmed", label: "Від підтверджених", slot: 1 },
                { key: "of_potential", label: "Від потенційних", slot: 2 },
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Категорії цільових дій"
          lead={
            <>
              Сім категорій, тому це рейтинг, а не сім ліній на одному графіку.
              Кожна показує, яка частка потенційної бази виконала саме цю дію.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title={`Рейтинг категорій — ${monthLabel(curKey)}`}
              note="Частка від потенційної бази."
            >
              <RankedBars
                data={cats.map((r) => ({
                  label: stripOrder(r.star_category),
                  value: r.star_rate,
                }))}
              />
            </Panel>

            <Panel
              title="Категорії в деталях"
              note="Зміна до попереднього місяця розрахована в самій марті."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Категорія</TableHead>
                    <TableHead className="text-right">Користувачів</TableHead>
                    <TableHead className="text-right">% бази</TableHead>
                    <TableHead className="text-right">Зміна</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cats.map((c) => (
                    <TableRow key={c.star_category}>
                      <TableCell className="font-medium">
                        {stripOrder(c.star_category)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(c.unique_users)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(c.star_rate)}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                        style={{
                          color:
                            c.mom_change_pct == null
                              ? undefined
                              : c.mom_change_pct >= 0
                                ? "var(--status-good)"
                                : "var(--status-critical)",
                        }}
                      >
                        {c.mom_change_pct == null
                          ? "—"
                          : delta(c.mom_change_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
