import {
  getNpsComments,
  getNpsComplexes,
  npsRollup,
  type NpsComplex,
} from "@/lib/data-operational";
import { monthLabel, n, n1, pct } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
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

/**
 * NPS — окрема сторінка, не блок усередині «Задоволеності» (прохання
 * Максима 2026-08-26: «показувати окремо від CSAT»).
 *
 * Причина не тільки в проханні: це інша шкала (1-10 проти 1-5), інше
 * питання («чи порекомендуєте» проти «оцініть конкретну послугу»), інша
 * періодичність (одна хвиля на всі ЖК проти хвиль по категоріях) і інший
 * спосіб рахунку (частки, а не середня). Поставити їх на одну сторінку
 * означало б запросити порівнювати 3,49 з 5,29.
 *
 * Дейт-пікера немає — з тієї ж причини, що й на CSAT: опитування живуть
 * хвилями, не місяцями.
 */

/**
 * Шкала в застосунку 1-10, а не канонічна 0-10 — перевірено на даних.
 * Розподіл лишається класичним (промоутери 9-10, пасивні 7-8), просто
 * нижня межа детракторів — 1, а не 0.
 */
const SCALE_NOTE =
  "Шкала застосунку 1-10 (не канонічна 0-10): промоутери 9-10, пасивні 7-8, детрактори 1-6.";

export default async function NpsPage() {
  const rows = getNpsComplexes();
  const comments = getNpsComments();

  if (rows.length === 0) {
    return (
      <>
        <PageHeader
          title="NPS"
          subtitle="Готовність рекомендувати"
          monthKey=""
        />
        <PageBody>
          <Panel title="Даних ще немає" note={SCALE_NOTE}>
            <p className="px-2 py-6 text-sm text-muted-foreground">
              Жодної відповіді на NPS-опитування поза тестовим ЖК. Сторінка
              наповниться сама, щойно хвиля збере перші голоси.
            </p>
          </Panel>
        </PageBody>
      </>
    );
  }

  // Хвилі за часом. Поточна — найсвіжіша; історії поки одна хвиля, але
  // структура готова до наступних (порівняння хвиль — головне питання NPS).
  const waveOrder = [
    ...new Map(rows.map((r) => [r.wave_label, r.wave_month_key])).entries(),
  ]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  const curWave = waveOrder.at(-1)!;
  const prevWave = waveOrder.length > 1 ? waveOrder.at(-2)! : null;

  const cur = rows.filter((r) => r.wave_label === curWave);
  const prev = prevWave ? rows.filter((r) => r.wave_label === prevWave) : [];

  const total = npsRollup(cur);
  const prevTotal = prev.length ? npsRollup(prev) : null;
  const curMonth = cur[0].wave_month_key;

  const byComplex = [...cur].sort(
    (a, b) => (b.nps_score ?? -999) - (a.nps_score ?? -999)
  );
  // Порівнювати ЖК має сенс лише там, де голосів вистачає: один голос дає
  // або −100, або +100, і такий ЖК завжди стоїть на краю рейтингу.
  const MIN_VOTES = 10;
  const comparable = byComplex.filter((r) => r.votes >= MIN_VOTES);
  const best = comparable[0];
  const worst = comparable.at(-1);

  const distribution = [
    { label: "Промоутери (9-10)", value: total.promoters },
    { label: "Пасивні (7-8)", value: total.passives },
    { label: "Детрактори (1-6)", value: total.detractors },
  ];

  const grades = comments.filter((c) => c.wave_label === curWave);

  return (
    <>
      <PageHeader
        title="NPS"
        subtitle="Готовність рекомендувати — одне питання на всі ЖК"
        monthKey=""
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="NPS"
            value={total.score === null ? "—" : n1(total.score)}
            /**
             * «−44,3» саме по собі нічого не каже — перше питання Максима
             * після релізу було буквально «а −44,3 це що таке?». Шкала має
             * стояти поруч із числом, а не ховатись під іконкою довідки:
             * NPS це не відсоток і не бал, це різниця часток у пунктах.
             */
            sub={
              prevTotal?.score != null
                ? `зі шкали −100…+100 · було ${n1(prevTotal.score)}`
                : "зі шкали −100…+100"
            }
            trend={
              prevTotal?.score != null && total.score != null
                ? {
                    text: `${total.score >= prevTotal.score ? "+" : "−"}${n1(
                      Math.abs(total.score - prevTotal.score)
                    )}`,
                    good: total.score >= prevTotal.score,
                  }
                : undefined
            }
          />
          <Kpi
            label="Середній бал"
            value={total.avgGrade === null ? "—" : n1(total.avgGrade)}
            sub="зі шкали 1-10"
          />
          <Kpi
            label="Відповідей"
            value={n(total.votes)}
            sub={`${n(total.comments)} з коментарем`}
          />
          <Kpi
            label="Детрактори"
            value={pct(total.detractorShare)}
            sub={`${n(total.detractors)} осіб`}
          />
        </div>

        <Section
          title="Підсумок хвилі"
          lead={
            <>
              Хвиля <Hl>{curWave}</Hl> ({monthLabel(curMonth)}) зібрала{" "}
              <Hl>{n(total.votes)}</Hl> відповідей у{" "}
              <Hl>{cur.length}</Hl> ЖК. Промоутерів{" "}
              <Hl>{pct(total.promoterShare)}</Hl>, детракторів{" "}
              <Hl>{pct(total.detractorShare)}</Hl> — звідси бал{" "}
              <Hl>{total.score === null ? "—" : n1(total.score)}</Hl>.
              <br />
              NPS — це <Hl>частка промоутерів мінус частка детракторів</Hl>, у
              пунктах від −100 (усі відмовляють) до +100 (усі рекомендують);
              0 означає, що задоволених і незадоволених порівну. Це НЕ
              відсоток і не оцінка. Середній бал відповідає на інше питання:
              два ЖК з однаковою середньою 5,5 можуть мати −20 і −60 залежно
              від того, чи люди ставлять 5-6, чи 1 і 10 навпіл. Тому обидва
              числа стоять поруч, і жодне не «головне».
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
            <Panel
              title="Розподіл"
              note={SCALE_NOTE}
              metric="NPS"
              contentClassName="flex-1"
            >
              <BklitDonut
                data={distribution}
                centerLabel="Відповідей"
                maxSlices={3}
                size={196}
              />
            </Panel>

            <Panel
              title="NPS по ЖК"
              note={`Смужка — NPS (нуль посередині), число праворуч — середній бал зі шкали 1-10. Порівнюються ЖК із ${MIN_VOTES}+ відповідями: на менших вибірках одна людина рухає бал на десятки пунктів.`}
              metric="NPS"
            >
              <NpsBars rows={comparable} />
            </Panel>
          </div>
        </Section>

        <Section
          title="Розріз по ЖК"
          lead={
            best && worst && best.complex_id !== worst.complex_id ? (
              <>
                Найвищий бал у <Hl>{best.complex_name}</Hl> (
                {n1(best.nps_score ?? 0)}), найнижчий — у{" "}
                <Hl>{worst.complex_name}</Hl> ({n1(worst.nps_score ?? 0)}).
                «Вибірка» — частка від КВАРТИР ЖК: цей знаменник не залежить
                від того, скільки людей поставили застосунок, тому єдиний
                придатний для порівняння ЖК між собою.
              </>
            ) : (
              <>Усі ЖК хвилі {curWave}.</>
            )
          }
        >
          <Panel
            title="Таблиця по ЖК"
            metric="NPS"
            action={
              <ExportXlsx
                fileName={`dim9000-nps-${curMonth}`}
                sheetName="NPS по ЖК"
                sheet={buildSheet(byComplex, [
                  { header: "ЖК", value: (r) => r.complex_name, width: 26 },
                  { header: "Відповідей", value: (r) => r.votes },
                  { header: "Промоутери", value: (r) => r.promoters },
                  { header: "Пасивні", value: (r) => r.passives },
                  { header: "Детрактори", value: (r) => r.detractors },
                  {
                    header: "NPS",
                    value: (r: NpsComplex) => r.nps_score,
                    format: "0.0",
                  },
                  {
                    header: "Середній бал",
                    value: (r) => r.avg_grade,
                    format: "0.00",
                  },
                  { header: "Квартир", value: (r) => r.n_apartments },
                  {
                    header: "Вибірка від квартир",
                    value: (r) => r.reach_of_apartments,
                    format: "0.0%",
                  },
                  {
                    header: "Вибірка від підтверджених",
                    value: (r) => r.reach_of_confirmed,
                    format: "0.0%",
                  },
                ])}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ЖК</TableHead>
                  <TableHead className="text-right">NPS</TableHead>
                  <TableHead className="text-right">Сер. бал</TableHead>
                  <TableHead className="text-right">Відповідей</TableHead>
                  <TableHead className="text-right">Пром.</TableHead>
                  <TableHead className="text-right">Пас.</TableHead>
                  <TableHead className="text-right">Детр.</TableHead>
                  <TableHead className="text-right">Вибірка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byComplex.map((r) => (
                  <TableRow key={r.complex_id}>
                    <TableCell className="font-medium">
                      {r.complex_name}
                      {r.votes < MIN_VOTES && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                          мало даних
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.nps_score === null ? "—" : n1(r.nps_score)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n1(r.avg_grade)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(r.votes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {n(r.promoters)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {n(r.passives)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {n(r.detractors)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {pct(r.reach_of_apartments)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Коментарі"
          lead={
            <>
              <Hl>{n(grades.length)}</Hl> відповідей із текстом. Персональних
              даних немає: найдрібніший розріз — будинок.
            </>
          }
        >
          <Panel
            title="Коментарі NPS"
            note="Відсортовано від найсвіжіших. Повний набір — в Excel."
            action={
              <ExportXlsx
                fileName={`dim9000-nps-comments-${curMonth}`}
                sheetName="Коментарі NPS"
                sheet={buildSheet(grades, [
                  { header: "Дата", value: (c) => c.answered_on, width: 12 },
                  { header: "ЖК", value: (c) => c.complex_name, width: 24 },
                  { header: "Будинок", value: (c) => c.house_address, width: 30 },
                  { header: "Оцінка", value: (c) => c.grade },
                  { header: "Група", value: (c) => c.nps_band_ua, width: 14 },
                  { header: "Коментар", value: (c) => c.comment, width: 90 },
                ])}
              />
            }
          >
            <ul className="flex flex-col gap-2 px-1">
              {grades.slice(0, 60).map((c) => (
                <li key={c.answer_id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span
                      className="inline-flex size-5 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums"
                      style={{
                        background:
                          c.grade >= 9
                            ? "color-mix(in oklab, var(--status-good) 15%, transparent)"
                            : c.grade >= 7
                              ? "var(--muted)"
                              : "color-mix(in oklab, var(--status-critical) 15%, transparent)",
                        color:
                          c.grade >= 9
                            ? "var(--status-good)"
                            : c.grade >= 7
                              ? "var(--muted-foreground)"
                              : "var(--status-critical)",
                      }}
                    >
                      {c.grade}
                    </span>
                    <span className="font-medium text-foreground">
                      {c.complex_name}
                    </span>
                    <span>{c.house_address}</span>
                    <span>·</span>
                    <span>{c.answered_on}</span>
                  </div>
                  <p className="mt-1.5 text-sm">{c.comment}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}

/**
 * Бали ЖК на осі від −100 до +100 з нулем ПОСЕРЕДИНІ.
 *
 * Готовий `RankedBars` тут не годиться: він рахує довжину смужки як частку
 * від максимуму й мовчки ламається на від'ємних значеннях (при всіх
 * від'ємних балах максимум теж від'ємний, і смужки стають то нульовими, то
 * найдовшими у найгіршого). NPS же за визначенням знакова величина, і
 * головне, що має бути видно, — по який бік нуля стоїть ЖК.
 */
function NpsBars({ rows }: { rows: NpsComplex[] }) {
  return (
    <ol className="flex flex-col gap-2 px-2 py-1">
      {rows.map((r) => {
        const score = r.nps_score ?? 0;
        const half = Math.min(Math.abs(score), 100) / 2;
        return (
          <li
            key={r.complex_id}
            className="grid grid-cols-[9rem_1fr_3.25rem_3.5rem] items-center gap-2.5"
          >
            <span
              className="truncate text-[11px] text-muted-foreground"
              title={r.complex_name}
            >
              {r.complex_name.replace(/^ЖК\s*/, "").replace(/"/g, "")}
            </span>
            <span className="relative h-4 w-full rounded-[3px] bg-muted/60">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className="absolute inset-y-0 rounded-[3px]"
                style={{
                  width: `${Math.max(half, 0.6)}%`,
                  left: score >= 0 ? "50%" : `${50 - half}%`,
                  background:
                    score >= 0 ? "var(--status-good)" : "var(--status-critical)",
                }}
              />
            </span>
            <span className="text-right text-[11px] font-medium tabular-nums">
              {n1(score)}
            </span>
            {/*
              Середній бал поруч із NPS — прохання Максима 2026-08-27. Це не
              дублювання таблиці нижче: саме тут видно, що бал і середня
              розходяться (Грейт має NPS 0 при середній 6,6, а Варшавський 2
              — NPS −55 при середній 4,8), і що порівнювати ЖК за одним лише
              NPS замало.
            */}
            <span
              className="text-right text-[11px] tabular-nums text-muted-foreground"
              title="Середній бал зі шкали 1-10"
            >
              {n1(r.avg_grade)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
