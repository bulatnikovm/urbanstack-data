import {
  getPeriod,
  getSegmentsMonthly,
  getUserBaseByComplex,
  getOsMonthly,
} from "@/lib/data";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  Hl,
  Kpi,
  PageBody,
  Panel,
  Section,
} from "@/components/dashboard";
import {
  StackedBars,
  TrendAreas,
  TrendLines,
  type Series,
} from "@/components/trend-charts";
import { BklitDonut } from "@/components/bklit-donut";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SEGMENT_SERIES: Series[] = [
  { key: "alive", label: "Живі", slot: 1 },
  { key: "sleeping", label: "Сонні", slot: 2 },
  { key: "dead", label: "Неактивні", slot: 3 },
];

export default async function AudiencePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { base, cur, prev, curKey, prevKey, isPartial, daysElapsed, daysInMonth, bounds, range, minKey } = getPeriod(sp);

  // Сегменти живі/сонні/неактивні — марта по ЖК, згортаємо до компанії
  const segByMonth = new Map<
    string,
    { alive: number; sleeping: number; dead: number }
  >();
  for (const r of getSegmentsMonthly()) {
    const acc = segByMonth.get(r.report_month_key) ?? {
      alive: 0,
      sleeping: 0,
      dead: 0,
    };
    acc.alive += r.segment_alive;
    acc.sleeping += r.segment_sleeping;
    acc.dead += r.segment_dead;
    segByMonth.set(r.report_month_key, acc);
  }
  const segRows = [...segByMonth.entries()]
    .filter(([m]) => m >= minKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
  const segCur = segByMonth.get(curKey);
  const segTotal = segCur ? segCur.alive + segCur.sleeping + segCur.dead : 0;

  // Розріз по ЖК за останній повний місяць
  const byComplex = getUserBaseByComplex()
    .filter((r) => r.report_month_key === curKey)
    .sort((a, b) => b.count_potential - a.count_potential);

  // Розподіл по ОС — з agg_os_monthly (distinct по людині).
  // НЕ з mart_version_adoption: там грануляція міс × ОС × ВЕРСІЯ, і сума
  // active_users по версіях рахує двічі того, хто за місяць був на двох
  // версіях (iOS показувало 6 080 замість 5 153, +18%).
  const osRows = getOsMonthly()
    .filter((r) => r.report_month_key === curKey)
    .map((r) => ({ label: r.os_type, value: r.users }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        title="Аудиторія"
        subtitle="Скільки нас і наскільки ця база реальна"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Потенційні користувачі"
            value={n(cur.count_potential)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(cur.count_potential / prev.count_potential - 1),
              good: cur.count_potential >= prev.count_potential,
            }}
          />
          <Kpi
            label="Підтверджені"
            value={n(cur.count_confirmed)}
            sub={`${pct(cur.rate_confirmed)} від бази`}
            trend={{
              text: pp(cur.rate_confirmed - prev.rate_confirmed),
              good: cur.rate_confirmed >= prev.rate_confirmed,
            }}
          />
          <Kpi
            label="Відвідувачі додатку"
            value={n(cur.visitors)}
            sub={`${pct(cur.rate_visitors_of_confirmed)} від підтверджених`}
            trend={{
              text: delta(cur.visitors / prev.visitors - 1),
              good: cur.visitors >= prev.visitors,
            }}
          />
          <Kpi
            label="MAU з цільовою дією"
            value={n(cur.active_core_mau)}
            sub={`${pct(cur.rate_mau_of_confirmed)} від підтверджених`}
            trend={{
              text: delta(cur.active_core_mau / prev.active_core_mau - 1),
              good: cur.active_core_mau >= prev.active_core_mau,
            }}
          />
        </div>

        <Section
          title="База користувачів"
          lead={
            <>
              У {monthLabel(curKey)} база налічує{" "}
              <Hl>{n(cur.count_potential)}</Hl> потенційних користувачів, з яких
              підтвердились <Hl>{n(cur.count_confirmed)}</Hl> —{" "}
              <Hl>{pct(cur.rate_confirmed)}</Hl>,{" "}
              {pp(cur.rate_confirmed - prev.rate_confirmed)} до попереднього
              місяця. З бази виключено{" "}
              <Hl>{n(cur.excluded_house_deactivated)}</Hl> користувачів
              деактивованих будинків і{" "}
              <Hl>{n(cur.excluded_role_deactivated)}</Hl> деактивованих ролей.
            </>
          }
        >
          <Panel
            title="Потенційні, підтверджені та відвідувачі"
            note="Потенційні — усі, хто хоч раз прив'язувався до приміщення. Підтверджені — верифіковані й не деактивовані. Відвідувачі — будь-яка подія в додатку за місяць."
          >
            <TrendAreas
              className="aspect-[3/1] w-full"
              data={base.map((r) => ({
                month: r.report_month_key,
                potential: r.count_potential,
                confirmed: r.count_confirmed,
                visitors: r.visitors,
              }))}
              series={[
                { key: "potential", label: "Потенційні", slot: 1 },
                { key: "confirmed", label: "Підтверджені", slot: 2 },
                { key: "visitors", label: "Відвідувачі", slot: 3 },
              ]}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Якість бази у відсотках"
              note="Частка підтверджених від потенційних і частка активних від підтверджених."
            >
              <TrendLines
                kind="pct"
                data={base.map((r) => ({
                  month: r.report_month_key,
                  confirmed_rate: r.rate_confirmed,
                  mau_rate: r.rate_mau_of_confirmed,
                }))}
                series={[
                  { key: "confirmed_rate", label: "% підтверджених", slot: 1 },
                  { key: "mau_rate", label: "% MAU від підтверджених", slot: 2 },
                ]}
              />
            </Panel>

            <Panel
              title="Живі / Сонні / Неактивні"
              note="Сегмент за активністю на ковзному вікні 2 місяці, по всій компанії."
            >
              <StackedBars data={segRows} series={SEGMENT_SERIES} />
            </Panel>
          </div>
        </Section>

        <Section
          title="Розріз по ЖК"
          lead={
            segCur && segTotal > 0 ? (
              <>
                Живими залишаються <Hl>{n(segCur.alive)}</Hl> користувачів —{" "}
                <Hl>{pct(segCur.alive / segTotal)}</Hl> підтвердженої бази.
                Нижче — з яких саме ЖК вона складається.
              </>
            ) : undefined
          }
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <Panel
              title={`Житлові комплекси — ${monthLabel(curKey)}`}
              note="Відсортовано за розміром бази."
            >
              <div className="max-h-[420px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>ЖК</TableHead>
                      <TableHead className="text-right">Потенційні</TableHead>
                      <TableHead className="text-right">Підтверджені</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Відвідувачі</TableHead>
                      <TableHead className="text-right">MAU</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byComplex.map((r) => (
                      <TableRow key={r.complex_id}>
                        <TableCell className="font-medium">
                          {r.complex_name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.count_potential)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.count_confirmed)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {pct(r.rate_confirmed, 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.visitors)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.active_core_mau)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel
              title="Операційна система"
              note={`Активні користувачі за ${monthLabel(curKey)}.`}
            >
              <BklitDonut data={osRows} centerLabel="Користувачів" />
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
