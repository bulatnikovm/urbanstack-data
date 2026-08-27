import { getLoadPeriod, getOrdersHouse, type LoadMonthly } from "@/lib/data-operational";
import { delta, monthLabel, n, n1, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { BklitLine } from "@/components/bklit-line";
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

const rate = (part: number, total: number) => (total > 0 ? part / total : 0);

/**
 * Скільки будинків показувати в антирейтингу. 15 — це рівно та довжина, яку
 * встигає прочитати керівник; повний список (110+ будинків) їде в Excel.
 */
const TOP_HOUSES = 15;

/**
 * Мінімум заявок, щоб будинок узагалі потрапив у рейтинг. Без порогу перші
 * місця забирають крихітні будинки, де три заявки на 12 квартир дають
 * «рекордне навантаження».
 */
const MIN_ORDERS = 10;

export default async function LoadPage({ searchParams }: PageProps<"/operations/load">) {
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
  } = getLoadPeriod(sp);

  const complexes = byComplex(curKey).sort(
    (a, b) => (b.load_rate ?? 0) - (a.load_rate ?? 0)
  );

  const curLoad = rate(cur.problem_complaint_count, cur.n_spaces);
  const prevLoad = rate(prev.problem_complaint_count, prev.n_spaces);
  const curTaskRatio = rate(
    cur.problem_complaint_tasks,
    cur.problem_complaint_count
  );
  const curOwnWork = rate(cur.employee_task_count, cur.total_tasks);
  const prevOwnWork = rate(prev.employee_task_count, prev.total_tasks);

  // ── Антирейтинг будинків ──────────────────────────────────────────────
  const houseRows = getOrdersHouse().filter(
    (r) => r.report_month_key === curKey
  );
  const byHouse = new Map<
    string,
    { complex: string; house: string; orders: number; apartments: number }
  >();
  for (const r of houseRows) {
    const acc = byHouse.get(r.house_id) ?? {
      complex: r.complex_name,
      house: r.house_number,
      orders: 0,
      apartments: r.n_apartments,
    };
    acc.orders += r.valid_count;
    byHouse.set(r.house_id, acc);
  }
  const houseRating = [...byHouse.entries()]
    .map(([house_id, h]) => ({
      house_id,
      ...h,
      perFlat: h.apartments > 0 ? (h.orders / h.apartments) * 100 : 0,
    }))
    .filter((h) => h.orders >= MIN_ORDERS && h.apartments > 0)
    .sort((a, b) => b.perFlat - a.perFlat);

  // Той самий індекс на рівні ЖК — сума заявок / сума квартир, не середнє
  // з будинкових індексів (інакше маленький будинок важить як великий).
  const byComplexRating = new Map<
    string,
    { orders: number; apartments: number }
  >();
  for (const h of [...byHouse.values()]) {
    const acc = byComplexRating.get(h.complex) ?? { orders: 0, apartments: 0 };
    acc.orders += h.orders;
    acc.apartments += h.apartments;
    byComplexRating.set(h.complex, acc);
  }
  const complexRating = [...byComplexRating.entries()]
    .map(([label, v]) => ({ label, value: rate(v.orders, v.apartments) * 100 }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const worstComplex = complexes[0];
  const backlogLeader = [...complexes].sort(
    (a, b) => b.backlog_30d - a.backlog_30d
  )[0];

  return (
    <>
      <PageHeader
        title="Антирейтинг і навантаження"
        subtitle="Де найгарячіше: навантаження на приміщення, прострочена черга, внутрішня робота"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Навантаження на приміщення"
            value={n1(curLoad * 100)}
            sub="проблем і скарг на 100 приміщень"
            trend={{
              // Не `pp`: показник вимірюється в заявках на 100 приміщень,
              // а не у відсотках, і «п.п.» тут була б чужою одиницею.
              text: `${curLoad >= prevLoad ? "+" : "−"}${n1(Math.abs(curLoad - prevLoad) * 100)}`,
              good: curLoad <= prevLoad,
            }}
          />
          <Kpi
            label="Прострочено 30+ днів"
            value={n(cur.backlog_30d)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: `${cur.backlog_30d - prev.backlog_30d >= 0 ? "+" : "−"}${Math.abs(cur.backlog_30d - prev.backlog_30d)}`,
              good: cur.backlog_30d <= prev.backlog_30d,
            }}
          />
          <Kpi
            label="Внутрішніх задач"
            value={n(cur.employee_task_count)}
            sub="без звернення мешканця"
            trend={{
              text: delta(
                cur.employee_task_count /
                  Math.max(prev.employee_task_count, 1) -
                  1
              ),
              good: null,
            }}
          />
          <Kpi
            label="Робота без заявок"
            value={pct(curOwnWork)}
            sub="від усієї внутрішньої роботи"
            trend={{ text: pp(curOwnWork - prevOwnWork), good: null }}
          />
        </div>

        <Section
          title="Навантаження по ЖК"
          lead={
            <>
              У {monthLabel(curKey)} на кожні 100 приміщень портфеля припадає{" "}
              <Hl>{n1(curLoad * 100)}</Hl> проблем і скарг.{" "}
              {worstComplex && (
                <>
                  Найгарячіший ЖК — <Hl>{worstComplex.complex_name}</Hl> (
                  {n1((worstComplex.load_rate ?? 0) * 100)} на 100 приміщень).{" "}
                </>
              )}
              Знаменник рухається разом із портфелем: коли будинок виходить
              з-під управління, його приміщення перестають бути знаменником з
              того ж місяця. У старому звіті знаменник був статичний, і ЖК, які
              вже пішли, лишались у ньому назавжди — разом із тестовими.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Навантаження по ЖК"
              note={`${monthLabel(curKey)}, проблем і скарг на 100 приміщень. Середнє по компанії — ${n1(curLoad * 100)}.`}
            >
              <RankedBars
                data={complexes.map((c) => ({
                  label: c.complex_name,
                  value: (c.load_rate ?? 0) * 100,
                }))}
                kind="num"
                highlightTop={3}
              />
            </Panel>

            <Panel
              title="Навантаження — динаміка"
              metric="Навантаження на приміщення"
              note="Сезонність видно неозброєним оком: опалювальний період дає стійкий підйом."
            >
              <BklitLine
                aspectRatio="2 / 1"
                kind="num"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  load: rate(r.problem_complaint_count, r.n_spaces) * 100,
                }))}
                series={[{ key: "load", label: "На 100 приміщень", slot: 1 }]}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Скарги окремо"
          lead={
            <>
              ⚠️ Тип «Скарга» практично не проставляється: за всю історію це{" "}
              <Hl>990</Hl> заявок зі <Hl>164 201</Hl> (0,6%), у{" "}
              {monthLabel(curKey)} — <Hl>{n(cur.complaint_count)}</Hl>. Тому
              старий «Антирейтинг скарг» був статистично порожнім, і будувати
              на ньому рішення не можна. Справжнє невдоволення сидить у ТЕКСТІ
              звичайних заявок — його ловлять сторінки «Ризик відтоку» і
              «Напруга і сегменти», а не це поле. Блок лишається для
              наступності зі старим звітом.
            </>
          }
        >
          <Panel
            title="Скарги окремо"
            note="Малі числа: одна-дві заявки міняють графік на десятки відсотків. Читати як індикатор наявності, не як рівень."
          >
            <BklitLine
              aspectRatio="3 / 1"
              data={inWindow(base).map((r) => ({
                month: r.report_month_key,
                complaints: r.complaint_count,
              }))}
              series={[{ key: "complaints", label: "Скарг", slot: 1 }]}
            />
          </Panel>
        </Section>

        <Section
          title="Антирейтинг"
          lead={
            <>
              Індекс проблемності — заявки на 100 квартир за{" "}
              {monthLabel(curKey)}. Показані лише будинки з {MIN_ORDERS}+
              заявками: без порогу перші місця забирають крихітні будинки, де
              три заявки на дюжину квартир дають «рекорд».{" "}
              {houseRating[0] && (
                <>
                  Очолює <Hl>{houseRating[0].complex}</Hl>, буд.{" "}
                  <Hl>{houseRating[0].house}</Hl> —{" "}
                  <Hl>{n1(houseRating[0].perFlat)}</Hl> заявки на 100 квартир.
                </>
              )}
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title="Антирейтинг будинків"
              note={`Топ-${TOP_HOUSES}. Виключення будинків — одне й похідне від даних (дата деактивації + seed тестових ЖК); у старому звіті тут працювала звірка за назвою ЖК і номером будинку рядками.`}
              action={
                <ExportXlsx
                  fileName={`dim9000-house-rating-${curKey}`}
                  sheetName="Антирейтинг"
                  sheet={buildSheet(houseRating, [
                    { header: "ЖК", value: (h) => h.complex, width: 24 },
                    { header: "Будинок", value: (h) => h.house, width: 12 },
                    { header: "Заявок", value: (h) => h.orders },
                    { header: "Квартир", value: (h) => h.apartments },
                    {
                      header: "На 100 квартир",
                      value: (h) => h.perFlat,
                      format: "0.00",
                      width: 15,
                    },
                  ])}
                />
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>ЖК</TableHead>
                    <TableHead>Буд.</TableHead>
                    <TableHead className="text-right">Заявок</TableHead>
                    <TableHead className="text-right">Квартир</TableHead>
                    <TableHead className="text-right">На 100 квартир</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {houseRating.slice(0, TOP_HOUSES).map((h, i) => (
                    <TableRow key={h.house_id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{h.complex}</TableCell>
                      <TableCell>{h.house}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(h.orders)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(h.apartments)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {n1(h.perFlat)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <Panel
              title="Антирейтинг ЖК"
              note="Заявок на 100 квартир. Сума заявок / сума квартир ЖК, а не середнє з будинкових індексів — інакше будинок на 12 квартир важив би як будинок на 400."
            >
              <RankedBars
                data={complexRating}
                kind="num"
                highlightTop={3}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Прострочена черга"
          lead={
            <>
              На кінець {monthLabel(curKey)} довше за 30 днів висять{" "}
              <Hl>{n(cur.backlog_30d)}</Hl> заявок.{" "}
              {backlogLeader && backlogLeader.backlog_30d > 0 && (
                <>
                  Найбільше в <Hl>{backlogLeader.complex_name}</Hl> —{" "}
                  <Hl>{n(backlogLeader.backlog_30d)}</Hl>.{" "}
                </>
              )}
              Це стан черги на конкретну дату, а не потік за місяць: та сама
              заявка рахується щомісяця, поки її не закриють. Поріг саме
              30 днів — у старому запиті поруч лежали 29 і 30, і який із них
              потрапляв на дашборд, з коду видно не було.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Черга 30+ у динаміці"
              note="Знімок на кінець кожного місяця, не наростаюча сума."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  backlog: r.backlog_30d,
                }))}
                series={[{ key: "backlog", label: "Прострочено 30+", slot: 1 }]}
              />
            </Panel>

            <Panel
              title="Прострочено 30+ днів"
              note={`Розріз по ЖК за ${monthLabel(curKey)}.`}
            >
              <RankedBars
                data={[...complexes]
                  .filter((c) => c.backlog_30d > 0)
                  .sort((a, b) => b.backlog_30d - a.backlog_30d)
                  .map((c) => ({
                    label: c.complex_name,
                    value: c.backlog_30d,
                  }))}
                kind="int"
                highlightTop={3}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Внутрішня робота"
          lead={
            <>
              У {monthLabel(curKey)} компанія виконала{" "}
              <Hl>{n(cur.employee_task_count)}</Hl> задач, які ніхто не
              замовляв, — це <Hl>{pct(curOwnWork)}</Hl> усієї внутрішньої
              роботи. Метрика зʼявилась щойно: раніше гео задачі бралось лише
              через заявку, а в задачі співробітника заявки за визначенням
              немає — тому всі 55,7 тис. таких задач лишались без ЖК і
              порахувати їх у розрізі було нічим.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Робота без заявок"
              metric={["Робота без заявок", "Задач на проблему"]}
              note={`Частка задач, які компанія завела сама: обходи, профілактика, планові роботи. Для порівняння: задач НА заявку — ${n1(curTaskRatio)}, і це число не рухається з 2022 року (CRM заводить рівно одну задачу на заявку), тому як показник трудомісткості воно не працює.`}
            >
              <BklitLine
                aspectRatio="2 / 1"
                kind="pct"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  own: rate(r.employee_task_count, r.total_tasks),
                }))}
                series={[{ key: "own", label: "Без заявки", slot: 1 }]}
              />
            </Panel>

            <Panel
              title="Внутрішні задачі — розріз по ЖК"
              metric="Внутрішніх задач"
              note={`${monthLabel(curKey)}. Задача рівня ЖК будинку не має — це нормально, а не пропуск даних.`}
              action={
                <ExportXlsx
                  fileName={`dim9000-load-${curKey}`}
                  sheetName="Навантаження"
                  sheet={buildSheet(complexes, [
                    { header: "ЖК", value: (c) => c.complex_name, width: 26 },
                    { header: "Приміщень", value: (c) => c.n_spaces },
                    { header: "Проблем", value: (c) => c.problem_count },
                    { header: "Скарг", value: (c) => c.complaint_count },
                    {
                      header: "На 100 приміщень",
                      value: (c: LoadMonthly) => (c.load_rate ?? 0) * 100,
                      format: "0.00",
                      width: 17,
                    },
                    { header: "Прострочено 30+", value: (c) => c.backlog_30d },
                    {
                      header: "Задач по заявках",
                      value: (c) => c.tasks_from_orders,
                    },
                    {
                      header: "Внутрішніх задач",
                      value: (c) => c.employee_task_count,
                    },
                  ])}
                />
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ЖК</TableHead>
                    <TableHead className="text-right">По заявках</TableHead>
                    <TableHead className="text-right">Внутрішніх</TableHead>
                    <TableHead className="text-right">Частка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...complexes]
                    .sort(
                      (a, b) => b.employee_task_count - a.employee_task_count
                    )
                    .map((c) => (
                      <TableRow key={c.complex_id}>
                        <TableCell className="font-medium">
                          {c.complex_name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(c.tasks_from_orders)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(c.employee_task_count)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(rate(c.employee_task_count, c.total_tasks))}
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
