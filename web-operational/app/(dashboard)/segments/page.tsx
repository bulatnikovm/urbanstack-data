import {
  getHouses,
  getSegmentPeriod,
  getSegmentsByComplex,
  type HouseMonthly,
  type SegmentComplexMonthly,
} from "@/lib/data";
import { monthLabel, n, pct, pp } from "@/lib/format";
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

/**
 * Що робити з кожним сегментом дії. Це не прикраса: однакові 85 балів в
 * організатора і в хронічного скаржника означають протилежні дії, і без
 * цього стовпчика таблиця сегментів — просто чотири числа.
 */
const PLAYBOOK: Record<string, string> = {
  Організатор:
    "переговори і персональний контакт; письмова відповідь на кампанію в 3 робочі дні",
  Хронічний:
    "нормально закривати заявки — він не ворог, він індикатор роботи сервісу",
  Розчарований:
    "найдешевший у поверненні: перезакрити одну-дві заявки і подзвонити",
  Мовчун: "перевірка «чи будинок ще наш» — мовчання передує виходу",
};

const houseKey = (h: { complex_name: string; house_number: string }) =>
  `${h.complex_name} ${h.house_number}`;

export default async function SegmentsPage({
  searchParams,
}: PageProps<"/segments">) {
  const sp = await searchParams;
  const { curKey, prevKey, bounds, range, cur, prev, base, inWindow } =
    getSegmentPeriod(sp);

  const byComplex = getSegmentsByComplex()
    .filter((c) => c.report_month_key === curKey && c.residents_active > 0)
    .sort(
      (a, b) =>
        b.tense_total / b.residents_active - a.tense_total / a.residents_active
    );

  // Будинки з достатнім знаменником — там, де частка взагалі щось означає.
  // Пороги перцентиля рахуються так само (від 20 активних мешканців), інакше
  // «Ліпінка» на 14 активних жителів злітала в топ через одну людину.
  const houses: HouseMonthly[] = getHouses()
    .filter((h) => h.report_month_key === curKey && h.n_active_residents >= 20)
    .sort((a, b) => (b.share_restless_plus ?? 0) - (a.share_restless_plus ?? 0));

  const shareTense = cur.tense_total / cur.residents_active;
  const sharePrev = prev.tense_total / prev.residents_active;

  const behaviour = [
    { label: "Організатор", value: cur.organizers },
    { label: "Хронічний", value: cur.chronic },
    { label: "Розчарований", value: cur.disappointed },
    { label: "Мовчун", value: cur.silent },
  ];

  const d = (a: number, b: number) =>
    `${a - b >= 0 ? "+" : "−"}${Math.abs(a - b)}`;

  return (
    <>
      <PageHeader
        title="Напруга і сегменти"
        subtitle="Хто живе в будинках: шкала напруги мешканців і що з нею робити"
        monthKey={curKey}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Напружених мешканців"
            value={n(cur.tense_total)}
            sub={`${pct(shareTense)} від ${n(cur.residents_active)} активних`}
            trend={{
              text: `${d(cur.tense_total, prev.tense_total)} до ${monthLabel(prevKey)}`,
              good: cur.tense_total <= prev.tense_total,
            }}
          />
          <Kpi
            label="Революціонерів"
            value={n(cur.revolutionaries)}
            sub={`тривожників ще ${n(cur.overthinkers)}`}
            trend={{
              text: d(cur.revolutionaries, prev.revolutionaries),
              good: cur.revolutionaries <= prev.revolutionaries,
            }}
          />
          <Kpi
            label="Організаторів"
            value={n(cur.organizers)}
            sub="учасники двох і більше ескалаційних кампаній"
            trend={{
              text: d(cur.organizers, prev.organizers),
              good: cur.organizers <= prev.organizers,
            }}
          />
          <Kpi
            label="Мовчунів"
            value={n(cur.silent)}
            sub="писали пів року, за три місяці — жодної заявки"
            trend={{
              text: d(cur.silent, prev.silent),
              good: cur.silent <= prev.silent,
            }}
          />
        </div>

        <Section
          title="Популяція"
          lead={
            <>
              У {monthLabel(curKey)} із <Hl>{n(cur.residents_active)}</Hl>{" "}
              мешканців, що зверталися до УК за рік, напружених —{" "}
              <Hl>{n(cur.tense_total)}</Hl> ({pct(shareTense)},{" "}
              {pp(shareTense - sharePrev)} до попереднього місяця). Ядро вузьке
              і воно вимірюване: <Hl>{n(cur.overthinkers)}</Hl> тривожників і{" "}
              <Hl>{n(cur.revolutionaries)}</Hl> революціонерів. Ще{" "}
              <Hl>{n(cur.ever_revolutionary)}</Hl> людей були революціонерами
              колись — зараз спокійні, але з фокусу не зникають.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Мешканці за рівнем напруги"
              metric={["Напружених мешканців", "Революціонерів"]}
              note="Вікно три місяці, не накопичення за весь час. Це не деталь реалізації: та сама шкала на 90 днях дає одного революціонера, на 12 місяцях — 38, на всій історії — 128. Бал, який уміє тільки рости, через два роки пофарбує весь портфель."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  restless: r.restless,
                  overthinkers: r.overthinkers,
                  revolutionaries: r.revolutionaries,
                }))}
                series={[
                  { key: "restless", label: "Неспокійні", slot: 1 },
                  { key: "overthinkers", label: "Тривожники", slot: 2 },
                  { key: "revolutionaries", label: "Революціонери", slot: 3 },
                ]}
              />
            </Panel>

            <Panel
              title="Історія і мовчання"
              metric="Мовчунів"
              note="«Вічний тег» зберігається як історія, а не як незмивний ярлик: людина може бути спокійною зараз і мати пік «Революціонер» у минулому. Мовчуни — окремий режим: перед виходом будинок частіше замовкає, ніж шумить."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  ever_rev: r.ever_revolutionary,
                  ever_osbb: r.ever_osbb,
                  silent: r.silent,
                }))}
                series={[
                  { key: "silent", label: "Мовчуни", slot: 1 },
                  { key: "ever_rev", label: "Були революціонерами", slot: 2 },
                  { key: "ever_osbb", label: "Згадували ОСББ", slot: 3 },
                ]}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Що робити"
          lead={
            <>
              Шкала напруги каже, НАСКІЛЬКИ гаряче. Сегмент дії каже, що з цим
              робити, і це різні речі: організатору потрібні переговори, а
              хронічному скаржнику — нормально закриті заявки. Однакове число
              балів у цих двох означає протилежні дії.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
            <Panel
              title="Сегменти дії"
              metric="Організаторів"
              note="Людина потрапляє рівно в один сегмент; порядок пріоритету — організатор, хронічний, розчарований, мовчун."
              contentClassName="flex-1"
            >
              <RankedBars kind="int" data={behaviour} highlightTop={1} />
            </Panel>

            <Panel
              title="Плейбук"
              metric="Організаторів"
              note="Персональних списків на цій сторінці немає навмисно: сегмент людини — це профілювання за персональними даними. Поіменний список іде керівнику комунікацій, не на спільний дашборд."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Сегмент</TableHead>
                    <TableHead className="text-right">Людей</TableHead>
                    <TableHead>Дія</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {behaviour.map((b) => (
                    <TableRow key={b.label}>
                      <TableCell className="font-medium">{b.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(b.value)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {PLAYBOOK[b.label]}
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
            <>
              Частка напружених — це в першу чергу властивість АУДИТОРІЇ, а не
              якості обслуговування: комфорт-клас із високими очікуваннями
              дає інший фон, ніж ЖК, де за рік не написали жодної
              ескалаційної заявки. Тому пороги настрою будинку рахуються
              перцентилем усередині портфеля, а не абсолютним відсотком.
            </>
          }
        >
          <Panel
            title={`Напруга по ЖК — ${monthLabel(curKey)}`}
            metric="Напружених мешканців"
            note="Знаменник — мешканці, що зверталися до УК за останні 12 місяців. Ті, хто не звертався жодного разу, у частку не входять: про них у нас просто немає сигналу."
            action={
              <ExportXlsx
                fileName={`urbanstack-segments-${curKey}`}
                sheetName="Напруга по ЖК"
                sheet={buildSheet(byComplex, [
                  {
                    header: "ЖК",
                    value: (c: SegmentComplexMonthly) => c.complex_name,
                    width: 28,
                  },
                  {
                    header: "Активних мешканців",
                    value: (c: SegmentComplexMonthly) => c.residents_active,
                    width: 18,
                  },
                  {
                    header: "Напружених",
                    value: (c: SegmentComplexMonthly) => c.tense_total,
                    width: 14,
                  },
                  {
                    header: "Частка напружених",
                    value: (c: SegmentComplexMonthly) =>
                      c.tense_total / c.residents_active,
                    format: "0.0%",
                    width: 18,
                  },
                  {
                    header: "Тривожників",
                    value: (c: SegmentComplexMonthly) => c.overthinkers,
                    width: 14,
                  },
                  {
                    header: "Революціонерів",
                    value: (c: SegmentComplexMonthly) => c.revolutionaries,
                    width: 16,
                  },
                  {
                    header: "Організаторів",
                    value: (c: SegmentComplexMonthly) => c.organizers,
                    width: 15,
                  },
                  {
                    header: "Мовчунів",
                    value: (c: SegmentComplexMonthly) => c.silent,
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
                  <TableHead className="text-right">Активних</TableHead>
                  <TableHead className="text-right">Напружених</TableHead>
                  <TableHead className="text-right">Частка</TableHead>
                  <TableHead className="text-right">Тривожників</TableHead>
                  <TableHead className="text-right">Революціонерів</TableHead>
                  <TableHead className="text-right">Організаторів</TableHead>
                  <TableHead className="text-right">Мовчунів</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byComplex.map((c) => (
                  <TableRow key={c.complex_id}>
                    <TableCell className="font-medium">
                      {c.complex_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.residents_active)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.tense_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(c.tense_total / c.residents_active)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.overthinkers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.revolutionaries)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.organizers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.silent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Будинки за складом"
          lead={
            <>
              Топ-15 будинків за часткою напружених мешканців. Це друга вісь
              зі сторінки «Ризик відтоку», показана крупним планом: колонка
              «приріст за 3 міс» — швидкість поширення, саме вона відрізняє
              одного крикуна від зародку групи.
            </>
          }
        >
          <Panel
            title={`Склад населення будинку — ${monthLabel(curKey)}`}
            metric="Ризикові будинки"
            note="Тільки будинки від 20 активних мешканців: у меншому знаменнику одна людина дає 7% і виносить будинок у топ, не означаючи нічого."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Будинок</TableHead>
                  <TableHead>Настрій</TableHead>
                  <TableHead className="text-right">Активних</TableHead>
                  <TableHead className="text-right">Напружених</TableHead>
                  <TableHead className="text-right">Частка</TableHead>
                  <TableHead className="text-right">Приріст за 3 міс</TableHead>
                  <TableHead>Стадія</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {houses.slice(0, 15).map((h) => (
                  <TableRow key={houseKey(h)}>
                    <TableCell className="font-medium">
                      {h.complex_name}{" "}
                      <span className="text-muted-foreground">
                        {h.house_number}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-xs whitespace-nowrap"
                      style={{
                        color:
                          h.house_mood === "Ризиковий"
                            ? "var(--status-critical)"
                            : h.house_mood === "Напружений"
                              ? "var(--status-warning)"
                              : undefined,
                      }}
                    >
                      {h.house_mood}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(h.n_active_residents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(h.n_restless_plus)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(h.share_restless_plus)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      style={{
                        color:
                          (h.contagion_3m ?? 0) > 0.02
                            ? "var(--status-warning)"
                            : undefined,
                      }}
                    >
                      {h.contagion_3m === null ? "—" : pp(h.contagion_3m)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {h.risk_stage_ua}
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
