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
import { StackedShare } from "@/components/stacked-share";
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
import { requireAccess } from "@/lib/guard";/**
 * Скільки місяців показує «Структура цільових дій».
 *
 * Прохання Микити 2026-09-02: тримати рівно 13 місяців, і щоб вікно їхало
 * з кожним новим («вер. 2025 — вер. 2026, і так з кожним місяцем»).
 *
 * Це ХВІСТ вибраного періоду, а не окреме вікно: дейт-пікер лишається
 * головним, просто на «Увесь час» стовпчики не перетворюються на частокіл
 * із тридцяти колонок, у якому підпис на сегменті вже не поміщається.
 * Стільки ж показують зведені на операційному SLA — там ця межа з'явилась
 * із тієї самої причини.
 */
const SHARE_MONTHS = 13;



const STAR_TOTAL = "0. Всього активних";

export default async function StarPage({ searchParams }: PageProps<"/star">) {
  await requireAccess("/star");
  const sp = await searchParams;
  const { curKey, prevKey, isPartial, daysElapsed, daysInMonth, bounds, range, inWindow, at, atOrZero } = getPeriod(sp);

  const star = getStar();
  const total = star.filter((r) => r.star_category === STAR_TOTAL);
  // `atOrZero`, а не `at(...)!`: марти мають різне покриття, і першого
  // числа місяця рядка за поточний місяць тут може ще не бути. Знак оклику
  // в такому разі давав 500 — саме так лягли /activation і /engagement
  // 01.09.2026 (див. lib/data.ts).
  const cur = atOrZero(total, curKey)!;
  const prev = atOrZero(total, prevKey)!;

  const cats = star
    .filter((r) => r.report_month_key === curKey && r.star_category !== STAR_TOTAL)
    .sort((a, b) => b.star_rate - a.star_rate);

  // ── Структура цільових дій по місяцях (ANA-16) ────────────────────────
  //
  // Прохання Максима: перенести в продуктовий дашборд стовпчики на 100% —
  // із чого складається місяць у розрізі STAR-категорій.
  //
  // Порядок категорій — ЇХНІЙ ВЛАСНИЙ («1. Заявки», «2. Оплата…»), а не за
  // величиною. Він і задає крок шкали сірого, тому сортувати тут за
  // часткою не можна: кольори поїхали б місяць у місяць.
  const shareMonths = [
    ...new Set(inWindow(star).map((r) => r.report_month_key)),
  ]
    .sort()
    .slice(-SHARE_MONTHS);
  const shareSeries = [
    ...new Set(
      star
        .filter((r) => r.star_category !== STAR_TOTAL)
        .map((r) => r.star_category)
    ),
  ]
    .sort()
    .map((category) => ({
      label: stripOrder(category),
      values: shareMonths.map(
        (m) =>
          star.find(
            (r) => r.report_month_key === m && r.star_category === category
          )?.unique_users ?? 0
      ),
    }));

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
            metric="STAR"
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
          title="Структура цільових дій"
          lead={
            <>
              Із чого складається місяць: частка кожної категорії серед усіх
              цільових дій. Це <Hl>не</Hl> частка бази — стовпчик завжди
              100%, і питання тут інше: не «скільки людей дійшло до дії», а
              «на що саме вони її витрачають». Одна людина може потрапити в
              кілька категорій, тому сума категорій більша за «Всього
              активних».
            </>
          }
        >
          <Panel
            title="Структура цільових дій по місяцях"
            note={`Стовпчик — 100%. Останні ${SHARE_MONTHS} місяців вибраного періоду. Підпис стоїть на частках від 3,5%: на менших цифри накладаються одна на одну. Наведи на місяць — покаже всі сім категорій із кількістю людей і точною часткою.`}
            action={
              <ExportXlsx
                fileName={`dim9000-star-structure-${curKey}`}
                sheetName="Структура"
                sheet={buildSheet(
                  shareMonths.flatMap((m) => {
                    const rows = star.filter(
                      (r) =>
                        r.report_month_key === m &&
                        r.star_category !== STAR_TOTAL
                    );
                    const tot = rows.reduce((a, r) => a + r.unique_users, 0);
                    return rows.map((r) => ({
                      month: m,
                      category: stripOrder(r.star_category),
                      users: r.unique_users,
                      share: tot > 0 ? r.unique_users / tot : 0,
                    }));
                  }),
                  [
                    { header: "Місяць", value: (r) => r.month, width: 10 },
                    { header: "Категорія", value: (r) => r.category, width: 24 },
                    { header: "Користувачів", value: (r) => r.users },
                    {
                      header: "Частка місяця",
                      value: (r) => r.share,
                      format: "0.0%",
                      width: 14,
                    },
                  ]
                )}
              />
            }
          >
            <StackedShare months={shareMonths} series={shareSeries} />
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
              metric="Категорії цільових дій"
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
              metric="Категорії цільових дій"
              note="Зміна до попереднього місяця розрахована в самій марті."
              action={
                <ExportXlsx
                  fileName={`dim9000-star-${curKey}`}
                  sheetName="STAR"
                  sheet={buildSheet(cats, [
                    {
                      header: "Категорія",
                      value: (c) => stripOrder(c.star_category),
                      width: 24,
                    },
                    { header: "Користувачів", value: (c) => c.unique_users },
                    {
                      header: "% потенційної бази",
                      value: (c) => c.star_rate,
                      format: "0.0%",
                      width: 20,
                    },
                    {
                      header: "% підтвердженої бази",
                      value: (c) => c.star_rate_of_confirmed,
                      format: "0.0%",
                      width: 22,
                    },
                    {
                      header: "Зміна за місяць",
                      value: (c) => c.mom_change_pct,
                      format: "0.0%",
                      width: 18,
                    },
                  ])}
                />
              }
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
