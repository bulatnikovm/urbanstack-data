import {
  getCategories,
  getComplexOverview,
  getOrdersHouse,
  getRequestsPeriod,
} from "@/lib/data-operational";
import { delta, monthLabel, n, n1, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { BklitArea } from "@/components/bklit-area";
import { BklitDonut } from "@/components/bklit-donut";
import { RankedBars } from "@/components/ranked-bars";
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

/**
 * ⚠️ Уся ця сторінка рахує ДІЙСНІ заявки (без скасованих), не всі подані.
 * Питання сторінки — «яка робота прийшла», а скасована заявка роботою не
 * стала. Сторінка SLA поруч рахує всі подані, бо там питання інше — «який
 * був вхідний потік».
 *
 * Це не дрібниця: перша версія брала `created_count` для розподілу по типах
 * і `problem_count` (лише дійсні) для картки — на одній сторінці стояли
 * 851 і 786 як та сама «Проблема». Виняток один: у блоці «Відхилені заявки»
 * знаменником навмисно є ВСІ заявки будинку, інакше частка відхилених
 * рахувалась би від бази, з якої їх уже прибрали.
 */

const rate = (part: number, total: number) => (total > 0 ? part / total : 0);

/**
 * Скільки категорій показувати окремими рядами на графіку динаміки.
 * Три — бо монохромна палітра дашборду має рівно три слоти (`--chart-1..3`);
 * решта категорій згортається в «Інше».
 */
const TOP_CATEGORIES = 3;

export default async function RequestsPage({
  searchParams,
}: PageProps<"/operations/requests">) {
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
    inWindow,
  } = getRequestsPeriod(sp);

  const categories = inWindow(getCategories());
  const curMonth = categories.filter((r) => r.report_month_key === curKey);

  // ── Категорії ─────────────────────────────────────────────────────────
  const byCategory = new Map<string, number>();
  for (const r of curMonth) {
    byCategory.set(
      r.category_ua,
      (byCategory.get(r.category_ua) ?? 0) + r.valid_created_count
    );
  }
  const categoryRanked = [...byCategory.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const topCategoryNames = new Set(
    categoryRanked.slice(0, TOP_CATEGORIES).map((c) => c.label)
  );

  // Динаміка: топ-категорії окремо, решта — «Інше». Ряди будуються по
  // місяцях вибраного вікна, а не по всіх наявних, інакше дейт-пікер
  // ні на що не впливав би.
  const monthKeys = [...new Set(categories.map((r) => r.report_month_key))].sort();
  const trend = monthKeys.map((month) => {
    const row: Record<string, string | number> = { month };
    for (const name of topCategoryNames) row[name] = 0;
    row["Інше"] = 0;
    for (const r of categories) {
      if (r.report_month_key !== month) continue;
      const key = topCategoryNames.has(r.category_ua) ? r.category_ua : "Інше";
      row[key] = (row[key] as number) + r.valid_created_count;
    }
    return row;
  });

  // ── Типи звернень ─────────────────────────────────────────────────────
  const byType = new Map<string, number>();
  for (const r of curMonth) {
    byType.set(r.type_ua, (byType.get(r.type_ua) ?? 0) + r.valid_created_count);
  }
  const typeRanked = [...byType.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const curQuestions = cur.question_count + cur.offer_count;
  const prevQuestions = prev.question_count + prev.offer_count;
  const curComplaintRate = rate(cur.complaint_count, cur.problem_complaint_count);
  const prevComplaintRate = rate(
    prev.complaint_count,
    prev.problem_complaint_count
  );

  // ── Будинки: відхилені й шукач аномалій ───────────────────────────────
  const houseRows = getOrdersHouse().filter(
    (r) => r.report_month_key === curKey
  );

  const byKind = new Map<string, { canceled: number; created: number }>();
  for (const r of houseRows) {
    const acc = byKind.get(r.property_kind_ua) ?? { canceled: 0, created: 0 };
    acc.canceled += r.canceled_count;
    acc.created += r.created_count;
    byKind.set(r.property_kind_ua, acc);
  }
  const kinds = [...byKind.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.canceled - a.canceled);

  const canceledByHouse = new Map<
    string,
    { complex: string; house: string; canceled: number; created: number }
  >();
  for (const r of houseRows) {
    const acc = canceledByHouse.get(r.house_id) ?? {
      complex: r.complex_name,
      house: r.house_number,
      canceled: 0,
      created: 0,
    };
    acc.canceled += r.canceled_count;
    acc.created += r.created_count;
    canceledByHouse.set(r.house_id, acc);
  }
  const topCanceled = [...canceledByHouse.values()]
    .filter((h) => h.canceled > 0)
    .sort((a, b) => b.canceled - a.canceled)
    .slice(0, 12);

  /**
   * Шукач аномалій. «Аномалія» тут — не статистика, а просте порівняння з
   * портфелем: скільки заявок цієї категорії припадає на квартиру в цьому
   * будинку проти медіани по всіх будинках із тією ж категорією.
   *
   * Медіана, а не середнє: один будинок із проривом труби зсуває середнє
   * так, що решта виглядає спокійною.
   */
  type Cell = {
    key: string;
    complex: string;
    house: string;
    category: string;
    type: string;
    created: number;
    apartments: number;
    perFlat: number;
  };
  const cells: Cell[] = houseRows
    .filter((r) => r.valid_count > 0 && r.n_apartments > 0)
    .map((r) => ({
      key: `${r.house_id}|${r.category_ua}|${r.type_ua}|${r.property_kind_ua}`,
      complex: r.complex_name,
      house: r.house_number,
      category: r.category_ua,
      type: r.type_ua,
      created: r.valid_count,
      apartments: r.n_apartments,
      perFlat: r.valid_count / r.n_apartments,
    }));

  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const medianByCategory = new Map<string, number>();
  for (const cat of new Set(cells.map((c) => c.category))) {
    medianByCategory.set(
      cat,
      median(cells.filter((c) => c.category === cat).map((c) => c.perFlat))
    );
  }
  const anomalies = cells
    // Поріг 5 заявок відсікає шум: у будинку на 40 квартир одна заявка вже
    // дає «в 3 рази вище медіани», і топ забивається випадковими одиницями.
    .filter((c) => c.created >= 5)
    .map((c) => ({
      ...c,
      ratio: c.perFlat / Math.max(medianByCategory.get(c.category) ?? 0, 1e-9),
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 15);

  // ── Особові рахунки ───────────────────────────────────────────────────
  const overview = getComplexOverview().filter(
    (r) => r.report_month_key === curKey
  );
  const accounts = overview.reduce((a, r) => a + r.n_billing_accounts, 0);

  return (
    <>
      <PageHeader
        title="Аналітика звернень"
        subtitle="Про що і як звертаються мешканці — категорії, типи, аномалії по будинках"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Проблем"
            value={n(cur.problem_count)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(
                cur.problem_count / Math.max(prev.problem_count, 1) - 1
              ),
              good: cur.problem_count <= prev.problem_count,
            }}
          />
          <Kpi
            label="Питань і пропозицій"
            value={n(curQuestions)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(curQuestions / Math.max(prevQuestions, 1) - 1),
              good: null,
            }}
          />
          <Kpi
            label="Скарг"
            value={n(cur.complaint_count)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: `${cur.complaint_count - prev.complaint_count >= 0 ? "+" : "−"}${Math.abs(cur.complaint_count - prev.complaint_count)}`,
              good: cur.complaint_count <= prev.complaint_count,
            }}
          />
          <Kpi
            label="Частка скарг"
            value={pct(curComplaintRate)}
            sub="від проблем і скарг"
            trend={{
              text: pp(curComplaintRate - prevComplaintRate),
              good: curComplaintRate <= prevComplaintRate,
            }}
          />
        </div>

        <Section
          title="Про що звертаються"
          lead={
            <>
              У {monthLabel(curKey)} найбільше звернень у категорії{" "}
              <Hl>{categoryRanked[0]?.label ?? "—"}</Hl> —{" "}
              <Hl>{n(categoryRanked[0]?.value ?? 0)}</Hl> заявок, це{" "}
              <Hl>
                {pct(
                  rate(
                    categoryRanked[0]?.value ?? 0,
                    categoryRanked.reduce((a, c) => a + c.value, 0)
                  )
                )}
              </Hl>{" "}
              усіх поданих. Словник категорій — один seed на весь проєкт: у
              старому звіті той самий перелік жив у трьох місцях і в одному з
              них «Домофон, відео, СКД» перекладалось інакше.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Про що звертаються"
              note={`Категорії за ${monthLabel(curKey)}, від найчисленнішої.`}
            >
              <RankedBars data={categoryRanked} kind="int" highlightTop={3} />
            </Panel>

            <Panel
              title="Типи звернень"
              note="«Не вказано» — не дефект даних: частина заявок свідомо заводиться без типу."
              contentClassName="flex-1"
            >
              <BklitDonut
                data={typeRanked}
                centerLabel="Заявок"
                maxSlices={4}
                size={196}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Динаміка категорій"
          lead={
            <>
              Три найбільші категорії окремими рядами, решта згорнута в
              «Інше». Тут і далі рахуються лише дійсні заявки — скасовані не
              стали роботою. Дані по категоріях вивантажуються вікном
              24 місяці: якщо обрати давніший період, графік буде порожній,
              хоча решта сторінки лишиться при даних.
            </>
          }
        >
          <Panel
            title="Динаміка категорій"
            note="Ряди накладаються, не стекуються: порівнювати треба форму кожної категорії, а не сумарну висоту."
          >
            <BklitArea
              aspectRatio="3 / 1"
              data={trend}
              series={[...topCategoryNames].map((name, i) => ({
                key: name,
                label: name,
                slot: (i + 1) as 1 | 2 | 3,
              }))}
            />
          </Panel>
        </Section>

        <Section
          title="Відхилені заявки"
          lead={
            <>
              У {monthLabel(curKey)} скасували або відхилили{" "}
              <Hl>{n(kinds.reduce((a, k) => a + k.canceled, 0))}</Hl> заявок.
              Розріз по типу обʼєкта показує, де саме — і чи це квартири, чи
              паркінг із коморами, де заявку частіше заводять «не туди».
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
            <Panel
              title="Відхилені заявки"
              note="Тип обʼєкта — з геоланцюжка приміщення, а не з тексту заявки."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип обʼєкта</TableHead>
                    <TableHead className="text-right">Відхилено</TableHead>
                    <TableHead className="text-right">Частка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kinds.map((k) => (
                    <TableRow key={k.label}>
                      <TableCell className="font-medium">{k.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(k.canceled)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(rate(k.canceled, k.created))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <Panel
              title="Будинки з найбільшою кількістю відхилень"
              metric="Відхилені заявки"
              note={`${monthLabel(curKey)}, топ-12 будинків. «Частка» — відхилені від усіх заявок будинку за місяць.`}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ЖК</TableHead>
                    <TableHead>Буд.</TableHead>
                    <TableHead className="text-right">Відхилено</TableHead>
                    <TableHead className="text-right">Частка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCanceled.map((h) => (
                    <TableRow key={`${h.complex}-${h.house}`}>
                      <TableCell className="font-medium">{h.complex}</TableCell>
                      <TableCell>{h.house}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(h.canceled)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(rate(h.canceled, h.created))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
        </Section>

        <Section
          title="Шукач аномалій"
          lead={
            <>
              Де конкретна категорія б’є значно вище норми. «Норма» — медіана
              заявок цієї ж категорії на квартиру по ВСІХ будинках портфеля за{" "}
              {monthLabel(curKey)}; медіана, а не середнє, бо один прорив труби
              зсуває середнє так, що решта виглядає спокійною. Показані лише
              комбінації з 5+ заявками — інакше топ забивають будинки, де одна
              заявка на 40 квартир формально дає «втричі вище норми».
            </>
          }
        >
          <Panel
            title="Шукач аномалій"
            note="Глибина — будинок. Глибше (до приміщення) свідомо не йдемо: рішення операційка приймає по будинку."
            action={
              <ExportXlsx
                fileName={`urbanstack-anomalies-${curKey}`}
                sheetName="Аномалії"
                sheet={buildSheet(anomalies, [
                  { header: "ЖК", value: (a) => a.complex, width: 24 },
                  { header: "Будинок", value: (a) => a.house, width: 10 },
                  { header: "Категорія", value: (a) => a.category, width: 26 },
                  { header: "Тип", value: (a) => a.type, width: 14 },
                  { header: "Заявок", value: (a) => a.created },
                  { header: "Квартир", value: (a) => a.apartments },
                  {
                    header: "На квартиру",
                    value: (a) => a.perFlat,
                    format: "0.000",
                    width: 13,
                  },
                  {
                    header: "До медіани",
                    value: (a) => a.ratio,
                    format: "0.0",
                    width: 12,
                  },
                ])}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ЖК</TableHead>
                  <TableHead>Буд.</TableHead>
                  <TableHead>Категорія</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead className="text-right">Заявок</TableHead>
                  <TableHead className="text-right">До медіани</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalies.map((a) => (
                  <TableRow key={a.key}>
                    <TableCell className="font-medium">{a.complex}</TableCell>
                    <TableCell>{a.house}</TableCell>
                    <TableCell>{a.category}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.type}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(a.created)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      ×{n1(a.ratio)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Особові рахунки"
          lead={
            <>
              У {monthLabel(curKey)} в активних будинках{" "}
              <Hl>{n(accounts)}</Hl> особових рахунків білінгу. У старому звіті
              ця цифра рахувалась як «квартири з власником» і суперечила
              власній документації, яка включала комерцію, паркінг і комори.
              Тут — реальні рахунки з білінгу.
            </>
          }
        >
          <Panel
            title="Особові рахунки"
            note="Point-in-time: рахунки будинку, деактивованого цього місяця, у поточний інвентар не входять."
          >
            <RankedBars
              data={overview
                .filter((r) => r.n_billing_accounts > 0)
                .map((r) => ({
                  label: r.complex_name,
                  value: r.n_billing_accounts,
                }))
                .sort((a, b) => b.value - a.value)}
              kind="int"
              highlightTop={3}
            />
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
