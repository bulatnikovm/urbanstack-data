import {
  csatAvg,
  csatWaveOrder,
  getCsatComments,
  getCsatComplexes,
  getCsatProblems,
  getCsatWaves,
  type CsatWave,
} from "@/lib/data-operational";
import { monthLabel, n, n1, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { BklitLine } from "@/components/bklit-line";
import { RankedBars } from "@/components/ranked-bars";
import { CsatFilters } from "@/components/csat-filters";
import { ExportXlsx } from "@/components/export-xlsx";
import { buildSheet } from "@/lib/xlsx";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const rate = (part: number, total: number) => (total > 0 ? part / total : 0);

/** Три категорії опитувань у постійному порядку — і на графіку, і в таблицях. */
const CATEGORIES = ["Прибудинкова", "Будинкова", "Охорона"] as const;

/** Скільки коментарів показувати в стрічці. Повний набір іде в Excel. */
const FEED_LIMIT = 60;

/** Скільки будинків в антирейтингу. */
const TOP_HOUSES = 15;

/**
 * Мінімум голосів, щоб будинок потрапив в антирейтинг. Без порогу перші
 * місця забирають будинки з двома голосами, де одна одиниця дає середню 1,0.
 */
const MIN_VOTES = 10;

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? null;

export default async function CsatPage({ searchParams }: PageProps<"/operations/csat">) {
  const sp = await searchParams;
  const activeComplex = one(sp.ck);
  const activeTheme = one(sp.theme);
  const activeGrade = one(sp.grade);

  const complexes = getCsatComplexes();
  const waves = getCsatWaves();
  const problems = getCsatProblems();
  const allComments = getCsatComments();

  const waveOrder = csatWaveOrder(waves);
  const latestByCategory = new Map<string, string>();
  for (const label of waveOrder) {
    const cat = waves.find((w) => w.wave_label === label)?.survey_category_ua;
    if (cat) latestByCategory.set(cat, label);
  }
  const latestLabels = new Set(latestByCategory.values());
  const latest = waves.filter((w) => latestLabels.has(w.wave_label));

  // ── Компанія загалом ──────────────────────────────────────────────────
  const avgLatest = csatAvg(latest);
  const votesLatest = latest.reduce((a, w) => a + w.votes, 0);
  const lowLatest = latest.reduce((a, w) => a + w.grade_1 + w.grade_2, 0);
  const commentsLatest = latest.reduce((a, w) => a + w.comments, 0);

  // Інтегральний по компанії — сума середніх по трьох останніх хвилях, той
  // самий принцип, що й для окремого ЖК.
  const companyByCategory = CATEGORIES.map((c) => ({
    category: c,
    avg: csatAvg(latest.filter((w) => w.survey_category_ua === c)),
  }));
  const integralCompany = companyByCategory.reduce(
    (a, c) => a + (c.avg ?? 0),
    0
  );

  // Попередня хвиля кожної категорії — для дельт.
  const prevByCategory = new Map<string, string>();
  for (const c of CATEGORIES) {
    const labels = waveOrder.filter(
      (l) => waves.find((w) => w.wave_label === l)?.survey_category_ua === c
    );
    if (labels.length >= 2) prevByCategory.set(c, labels.at(-2)!);
  }
  const prevLabels = new Set(prevByCategory.values());
  const prev = waves.filter((w) => prevLabels.has(w.wave_label));
  const avgPrev = csatAvg(prev);
  const lowPrev = prev.reduce((a, w) => a + w.grade_1 + w.grade_2, 0);
  const votesPrev = prev.reduce((a, w) => a + w.votes, 0);

  const votesTotal = complexes.reduce((a, c) => a + c.votes_latest, 0);
  const apartmentsTotal = complexes.reduce((a, c) => a + (c.n_apartments ?? 0), 0);
  const reachConfirmed = rate(
    votesTotal,
    complexes.reduce((a, c) => a + (c.n_users_confirmed ?? 0), 0)
  );
  // Правка Артема: репрезентативність вибірки міряється до КІЛЬКОСТІ КВАРТИР.
  const reachApartments = rate(votesTotal, apartmentsTotal);

  // ── Динаміка по хвилях ────────────────────────────────────────────────
  const trend = waveOrder.map((label) => {
    const rows = waves.filter((w) => w.wave_label === label);
    const cat = rows[0]?.survey_category_ua ?? "";
    return {
      wave: label,
      short: label.replace(/\s*\(\d+-\d+\)$/, ""),
      month: rows[0]?.wave_month_key ?? "",
      category: cat,
      avg: csatAvg(rows),
      votes: rows.reduce((a, w) => a + w.votes, 0),
      comments: rows.reduce((a, w) => a + w.comments, 0),
    };
  });
  /**
   * Вісь X — СПРАВЖНІЙ ключ місяця ("2026-05"), а не текст мітки хвилі.
   * LineChart тут часовий: він парсить значення осі як дату, і на
   * «Охорона трав. 2026» ламався в нечитабельне «січ. 25 р. — січ. 26».
   *
   * Точка = місяць, ряд = категорія. У червні 2026 було дві хвилі різних
   * категорій — це дві точки в одному місяці, кожна у своєму ряду.
   * Місяці без хвилі категорії лишаються `null` (не 0): тултип такі ряди
   * тепер пропускає, а «0» означало б «поставили нуль балів».
   */
  const trendChart = [...new Set(trend.map((t) => t.month))]
    .sort()
    .map((month) => ({
      month,
      ...Object.fromEntries(
        CATEGORIES.map((c) => [
          c,
          trend.find((t) => t.month === month && t.category === c)?.avg ?? null,
        ])
      ),
    }));

  /**
   * Категорія × місяць — прохання Максима 2026-08-26: «додати саме динаміку
   * в розрізі категорій: Охорона 1, 2, 3 місяць; Прибудинкова 1, 2, 3
   * місяць». Графік поруч показує те саме лініями, але порівнювати ДВІ
   * сусідні цифри на око по лінії важко, а операційці потрібні саме цифри.
   *
   * Порожня клітинка означає «хвилі цієї категорії того місяця не було» —
   * розклад у категорій різний: Охорона опитувалась тричі (груд. 2025,
   * трав. і лип. 2026), Прибудинкова й Будинкова — двічі.
   */
  const categoryMonths = [...new Set(trend.map((t) => t.month))].sort();
  const categoryRows = CATEGORIES.map((c) => ({
    category: c,
    cells: categoryMonths.map((month) => {
      const rows = waves.filter(
        (w) => w.wave_month_key === month && w.survey_category_ua === c
      );
      return {
        month,
        avg: csatAvg(rows),
        votes: rows.reduce((a, w) => a + w.votes, 0),
      };
    }),
  }));

  // ── Матриця ЖК × хвиля ────────────────────────────────────────────────
  const complexNames = [...new Set(waves.map((w) => w.complex_name))].sort();
  const matrix = complexNames.map((name) => ({
    name,
    cells: waveOrder.map((label) => {
      const rows = waves.filter(
        (w) => w.complex_name === name && w.wave_label === label
      );
      return {
        label,
        avg: csatAvg(rows),
        votes: rows.reduce((a, w) => a + w.votes, 0),
      };
    }),
  }));

  // ── Розподіл оцінок по компанії ───────────────────────────────────────
  const distribution = [5, 4, 3, 2, 1].map((g) => ({
    label: `Оцінка ${g}`,
    value: latest.reduce(
      (a, w) => a + (w[`grade_${g}` as keyof CsatWave] as number),
      0
    ),
  }));

  // ── Антирейтинг будинків ──────────────────────────────────────────────
  const houseMap = new Map<
    string,
    {
      complex: string;
      address: string;
      apartments: number;
      votes: number;
      grade_sum: number;
      low: number;
    }
  >();
  for (const w of latest) {
    if (!w.house_id) continue;
    const acc = houseMap.get(w.house_id) ?? {
      complex: w.complex_name,
      address: w.house_address,
      apartments: w.n_apartments ?? 0,
      votes: 0,
      grade_sum: 0,
      low: 0,
    };
    acc.votes += w.votes;
    acc.grade_sum += w.grade_sum;
    acc.low += w.grade_1 + w.grade_2;
    houseMap.set(w.house_id, acc);
  }
  const houses = [...houseMap.entries()]
    .map(([house_id, h]) => ({
      house_id,
      ...h,
      avg: h.votes > 0 ? h.grade_sum / h.votes : 0,
      lowShare: rate(h.low, h.votes),
      // Правка Артема: на рівні будинку вибірка міряється до квартир ЦЬОГО
      // будинку, а не до квартир ЖК.
      reach: rate(h.votes, h.apartments),
    }))
    .filter((h) => h.votes >= MIN_VOTES)
    .sort((a, b) => a.avg - b.avg);

  // ── Про що пишуть ─────────────────────────────────────────────────────
  // ⚠️ Категорію НЕ можна отримати сумуванням її тем: коментар «брудно в холі
  // й газон не косять» дає +1 «Прибиранню» і +1 «Території», але в категорії
  // «Чистота та благоустрій» він ОДИН. Тому марта віддає два рівні окремими
  // рядками, і тут ми беремо потрібний, а не складаємо.
  const problemByCategory = new Map<string, number>();
  const problemByTheme = new Map<string, number>();
  for (const p of problems) {
    if (activeComplex && p.complex_id !== activeComplex) continue;
    if (p.level === "category") {
      problemByCategory.set(
        p.problem_category_ua,
        (problemByCategory.get(p.problem_category_ua) ?? 0) + p.comments
      );
    } else {
      problemByTheme.set(
        p.problem_theme_ua,
        (problemByTheme.get(p.problem_theme_ua) ?? 0) + p.comments
      );
    }
  }
  const problemCats = [...problemByCategory.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const problemThemes = [...problemByTheme.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // Критичність: частка негативних відгуків серед тих, хто взагалі писав.
  const criticality = complexNames
    .map((name) => {
      const rows = allComments.filter((c) => c.complex_name === name);
      const negative = rows.filter((c) => c.is_negative).length;
      return {
        name,
        total: rows.length,
        negative,
        share: rate(negative, rows.length),
      };
    })
    .filter((c) => c.total >= 10)
    .sort((a, b) => b.share - a.share);

  // ── Стрічка коментарів ────────────────────────────────────────────────
  const feed = allComments
    .filter((c) => !activeComplex || c.complex_id === activeComplex)
    .filter((c) => !activeTheme || c.themes.split("|").includes(activeTheme))
    .filter((c) =>
      !activeGrade
        ? true
        : activeGrade === "low"
          ? c.grade <= 2
          : activeGrade === "mid"
            ? c.grade === 3
            : c.grade >= 4
    );

  const complexOptions = [...new Set(allComments.map((c) => c.complex_id))]
    .map((id) => ({
      value: id,
      label:
        allComments
          .find((c) => c.complex_id === id)!
          .complex_name.replace(/^ЖК\s+/, "")
          .replace(/"/g, "") ?? id,
      count: allComments.filter((c) => c.complex_id === id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const themeOptions = problemThemes.slice(0, 10).map((t) => ({
    value: t.label,
    label: t.label,
    count: t.value,
  }));

  return (
    <>
      <PageHeader
        title="Задоволеність мешканців"
        subtitle="Опитування CSAT: прибудинкова територія, будинок, охорона"
        monthKey=""
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Інтегральна оцінка"
            value={n1(integralCompany)}
            sub="сума трьох напрямків, максимум 15"
            trend={{ text: "по компанії", good: null }}
          />
          <Kpi
            label="Середня оцінка"
            value={n1(avgLatest ?? 0)}
            sub="останні хвилі, з 5"
            trend={{
              text:
                avgPrev === null || avgLatest === null
                  ? "—"
                  : `${avgLatest >= avgPrev ? "+" : "−"}${n1(Math.abs(avgLatest - avgPrev))}`,
              good: (avgLatest ?? 0) >= (avgPrev ?? 0),
            }}
          />
          <Kpi
            label="Оцінок 1–2 в опитуваннях"
            value={pct(rate(lowLatest, votesLatest))}
            sub={`${n(lowLatest)} з ${n(votesLatest)} голосів`}
            trend={{
              text: pp(
                rate(lowLatest, votesLatest) - rate(lowPrev, votesPrev)
              ),
              good:
                rate(lowLatest, votesLatest) <= rate(lowPrev, votesPrev),
            }}
          />
          <Kpi
            label="Участь"
            value={pct(reachApartments)}
            sub={`${n(votesLatest)} голосів на ${n(apartmentsTotal)} квартир`}
            trend={{
              text: `${pct(reachConfirmed)} від підтверджених`,
              good: null,
            }}
          />
        </div>

        <Section
          title="Рейтинг ЖК"
          lead={
            <>
              Інтегральна оцінка — <Hl>сума</Hl> середніх за трьома напрямками,
              а не середня з них. Сенс саме в сумі: ЖК має бути добрим за всіма
              напрямками одразу, і провал в одному не згладжується успіхом в
              іншому. Максимум 10 за напрямками УК і 15 разом з охороною.
              Місце в рейтингу — за <Hl>Інтегральним УК</Hl>: охорона це
              підрядник, якого міняють, а територія і будинок — власна робота
              компанії. Прочерк означає «немає хвилі», а не нуль.
            </>
          }
        >
          <Panel
            title="Рейтинг ЖК"
            metric={["Рейтинг ЖК", "Інтегральний УК", "Інтегральна оцінка"]}
            note="Береться остання хвиля кожної категорії. Якщо в ЖК за неї ніхто не проголосував — прочерк, стару хвилю не підставляємо."
            action={
              <ExportXlsx
                fileName="dim9000-csat-rating"
                sheetName="Рейтинг CSAT"
                sheet={buildSheet(complexes, [
                  { header: "Місце", value: (c) => c.rating_uk },
                  { header: "ЖК", value: (c) => c.complex_name, width: 24 },
                  {
                    header: "Прибудинкова",
                    value: (c) => c.avg_adjacent,
                    format: "0.00",
                    width: 14,
                  },
                  {
                    header: "Будинкова",
                    value: (c) => c.avg_building,
                    format: "0.00",
                    width: 12,
                  },
                  {
                    header: "Охорона",
                    value: (c) => c.avg_security,
                    format: "0.00",
                    width: 11,
                  },
                  {
                    header: "Інтегральний УК",
                    value: (c) => c.integral_uk,
                    format: "0.00",
                    width: 16,
                  },
                  {
                    header: "Інтегральний загальний",
                    value: (c) => c.integral_total,
                    format: "0.00",
                    width: 21,
                  },
                  { header: "Голосів", value: (c) => c.votes_latest },
                  { header: "Коментарів", value: (c) => c.comments_latest },
                  { header: "Квартир", value: (c) => c.n_apartments },
                  {
                    header: "Від квартир",
                    value: (c) => c.reach_of_apartments,
                    format: "0.0%",
                    width: 13,
                  },
                  {
                    header: "Від підтверджених",
                    value: (c) => c.reach_of_confirmed,
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
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>ЖК</TableHead>
                  <TableHead className="text-right">Прибудинкова</TableHead>
                  <TableHead className="text-right">Будинкова</TableHead>
                  <TableHead className="text-right">Охорона</TableHead>
                  <TableHead className="text-right">Інт. УК</TableHead>
                  <TableHead className="text-right">Інт. загальний</TableHead>
                  <TableHead className="text-right">Голосів</TableHead>
                  <TableHead className="text-right">Від квартир</TableHead>
                  <TableHead className="text-right">Від підтв.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complexes.map((c) => (
                  <TableRow key={c.complex_id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {c.integral_uk === null ? "—" : c.rating_uk}
                    </TableCell>
                    <TableCell className="font-medium">
                      {c.complex_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.avg_adjacent === null ? "—" : n1(c.avg_adjacent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.avg_building === null ? "—" : n1(c.avg_building)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.avg_security === null ? "—" : n1(c.avg_security)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {c.integral_uk === null ? "—" : n1(c.integral_uk)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.integral_total === null ? "—" : n1(c.integral_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(c.votes_latest)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {c.reach_of_apartments === null
                        ? "—"
                        : pct(c.reach_of_apartments, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.reach_of_confirmed === null
                        ? "—"
                        : pct(c.reach_of_confirmed, 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Динаміка по хвилях"
          lead={
            <>
              Опитування йдуть <Hl>хвилями</Hl>, не щомісяця: {waveOrder.length}{" "}
              хвиль за {trend[0]?.short.split(" ").slice(-2).join(" ")} —{" "}
              {trend.at(-1)?.short.split(" ").slice(-2).join(" ")}. Тому тут
              немає дейт-пікера: місячний діапазон обіцяв би вибір, якого в
              даних немає. Кожна лінія рветься там, де хвилі цієї категорії не
              було — це не пропуск, а факт розкладу.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title="Оцінка по хвилях"
              note="Точка — місяць хвилі. Розрив у лінії означає, що опитування цієї категорії того місяця не було, а не нульову оцінку."
            >
              <BklitLine
                aspectRatio="5 / 2"
                kind="num"
                xKey="month"
                data={trendChart}
                series={CATEGORIES.map((c, i) => ({
                  key: c,
                  label: c,
                  slot: (i + 1) as 1 | 2 | 3,
                }))}
              />
            </Panel>

            <Panel
              title="Хвилі"
              metric="Оцінка по хвилях"
              note="Скільки людей узяло участь у кожній хвилі й скільки лишило текст."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Хвиля</TableHead>
                    <TableHead className="text-right">Оцінка</TableHead>
                    <TableHead className="text-right">Голосів</TableHead>
                    <TableHead className="text-right">Коментарів</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...trend].reverse().map((t) => (
                    <TableRow key={t.wave}>
                      <TableCell className="font-medium">{t.short}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.avg === null ? "—" : n1(t.avg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(t.votes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(t.comments)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>

          <Panel
            title="Категорія × місяць"
            note="Середня оцінка й кількість голосів у дужках. Прочерк — хвилі цієї категорії того місяця не було: розклад у категорій різний, і це не пропуск даних."
            action={
              <ExportXlsx
                fileName="dim9000-csat-categories"
                sheetName="Категорія × місяць"
                sheet={buildSheet(
                  categoryRows.flatMap((r) =>
                    r.cells.map((c) => ({ category: r.category, ...c }))
                  ),
                  [
                    { header: "Категорія", value: (r) => r.category, width: 16 },
                    { header: "Місяць", value: (r) => r.month, width: 10 },
                    {
                      header: "Середня оцінка",
                      value: (r) => r.avg,
                      format: "0.00",
                      width: 14,
                    },
                    { header: "Голосів", value: (r) => r.votes },
                  ]
                )}
              />
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">
                      Категорія
                    </TableHead>
                    {categoryMonths.map((m) => (
                      <TableHead
                        key={m}
                        className="text-right whitespace-nowrap"
                      >
                        {monthLabel(m)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryRows.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="sticky left-0 bg-card font-medium whitespace-nowrap">
                        {row.category}
                      </TableCell>
                      {row.cells.map((c) => (
                        <TableCell
                          key={c.month}
                          className="text-right tabular-nums whitespace-nowrap"
                        >
                          {c.avg === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {n1(c.avg)}
                              <span className="ml-1 text-[11px] text-muted-foreground">
                                ({n(c.votes)})
                              </span>
                            </>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>

          <Panel
            title="Матриця ЖК × хвиля"
            note="Середня оцінка й кількість голосів у дужках. Прочерк — у цій хвилі ЖК не голосував."
            action={
              <ExportXlsx
                fileName="dim9000-csat-matrix"
                sheetName="ЖК × хвиля"
                sheet={buildSheet(waves, [
                  { header: "Хвиля", value: (w) => w.wave_label, width: 32 },
                  { header: "Категорія", value: (w) => w.survey_category_ua, width: 14 },
                  { header: "ЖК", value: (w) => w.complex_name, width: 22 },
                  { header: "Будинок", value: (w) => w.house_address, width: 32 },
                  { header: "Голосів", value: (w) => w.votes },
                  { header: "Сума балів", value: (w) => w.grade_sum, width: 12 },
                  { header: "Коментарів", value: (w) => w.comments },
                  { header: "5", value: (w) => w.grade_5 },
                  { header: "4", value: (w) => w.grade_4 },
                  { header: "3", value: (w) => w.grade_3 },
                  { header: "2", value: (w) => w.grade_2 },
                  { header: "1", value: (w) => w.grade_1 },
                ])}
              />
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card">ЖК</TableHead>
                    {waveOrder.map((label) => (
                      <TableHead key={label} className="text-right whitespace-nowrap">
                        {label.replace(/\s*\(\d+-\d+\)$/, "")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="sticky left-0 bg-card font-medium whitespace-nowrap">
                        {row.name}
                      </TableCell>
                      {row.cells.map((c) => (
                        <TableCell
                          key={c.label}
                          className="text-right tabular-nums whitespace-nowrap"
                        >
                          {c.avg === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {n1(c.avg)}
                              <span className="ml-1 text-[11px] text-muted-foreground">
                                ({n(c.votes)})
                              </span>
                            </>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </Section>

        <Section
          title="Розподіл оцінок і участь"
          lead={
            <>
              З <Hl>{n(votesLatest)}</Hl> голосів останніх хвиль{" "}
              <Hl>{pct(rate(lowLatest, votesLatest))}</Hl> — це оцінки 1 або 2,
              і <Hl>{n(commentsLatest)}</Hl> людей додали текст. Вибірка
              міряється до <Hl>кількості квартир</Hl>: цей знаменник не
              залежить від того, скільки людей поставили застосунок, тому
              тільки його можна порівнювати між ЖК як міру достатності. У
              рейтингу поруч є й частка від підтверджених користувачів — вона
              каже інше: наскільки активна саме та аудиторія, до якої
              опитування взагалі дійшло.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Розподіл оцінок"
              note="Останні хвилі всіх трьох категорій разом."
            >
              <RankedBars data={distribution} kind="int" highlightTop={0} />
            </Panel>

            <Panel
              title="Участь по ЖК"
              note="Голоси до кількості квартир ЖК. Саме цей знаменник показує, чи достатня вибірка: він не залежить від того, скільки людей поставили застосунок."
            >
              <RankedBars
                data={complexes
                  .filter((c) => c.reach_of_apartments !== null)
                  .map((c) => ({
                    label: c.complex_name,
                    value: c.reach_of_apartments ?? 0,
                  }))
                  .sort((a, b) => b.value - a.value)}
                kind="pct"
                highlightTop={3}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Антирейтинг будинків"
          lead={
            <>
              Найнижчі середні оцінки по будинках в останніх хвилях. Показані
              лише будинки з {MIN_VOTES}+ голосами: на менших числах одна
              одиниця обвалює середню й рейтинг перестає щось означати.
              {houses[0] && (
                <>
                  {" "}
                  Найгірше зараз у <Hl>{houses[0].address}</Hl> —{" "}
                  <Hl>{n1(houses[0].avg)}</Hl> з 5.
                </>
              )}
            </>
          }
        >
          <Panel
            title="Антирейтинг будинків"
            note={`Топ-${TOP_HOUSES} знизу. «Вибірка» — голоси до кількості квартир САМЕ ЦЬОГО будинку. Будинок відповіді визначається за респондентом, а не за полем опитування — покриття 99,8%.`}
            action={
              <ExportXlsx
                fileName="dim9000-csat-houses"
                sheetName="Будинки"
                sheet={buildSheet(houses, [
                  { header: "ЖК", value: (h) => h.complex, width: 22 },
                  { header: "Будинок", value: (h) => h.address, width: 34 },
                  { header: "Голосів", value: (h) => h.votes },
                  { header: "Квартир", value: (h) => h.apartments },
                  {
                    header: "Вибірка",
                    value: (h) => h.reach,
                    format: "0.0%",
                    width: 10,
                  },
                  {
                    header: "Середня",
                    value: (h) => h.avg,
                    format: "0.00",
                    width: 10,
                  },
                  {
                    header: "Частка 1–2",
                    value: (h) => h.lowShare,
                    format: "0.0%",
                    width: 12,
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
                  <TableHead>Будинок</TableHead>
                  <TableHead className="text-right">Голосів</TableHead>
                  <TableHead className="text-right">Квартир</TableHead>
                  <TableHead className="text-right">Вибірка</TableHead>
                  <TableHead className="text-right">Середня</TableHead>
                  <TableHead className="text-right">Частка 1–2</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {houses.slice(0, TOP_HOUSES).map((h, i) => (
                  <TableRow key={h.house_id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">{h.complex}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.address}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(h.votes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {h.apartments > 0 ? n(h.apartments) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.apartments > 0 ? pct(h.reach, 0) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {n1(h.avg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(h.lowShare, 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Про що пишуть"
          lead={
            <>
              Розбір негативних коментарів (оцінка 1–3) за словником тем.{" "}
              {problemCats[0] && (
                <>
                  Найбільша тема — <Hl>{problemCats[0].label}</Hl>:{" "}
                  <Hl>{n(problemCats[0].value)}</Hl> коментарів.{" "}
                </>
              )}
              ⚠️ Один коментар потрапляє в <Hl>кожну</Hl> свою тему, тому сума
              по темах більша за кількість коментарів — люди скаржаться на все
              одразу, і розкладати це «по одній головній» означало б викидати
              половину сказаного. У категоріях кожен коментар порахований{" "}
              <Hl>один раз</Hl>, тому сума категорій менша за суму тем.
              Словник упізнає <Hl>87%</Hl> негативних коментарів; точність не
              заміряна.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Про що пишуть"
              note={
                activeComplex
                  ? "Фільтр по ЖК зі стрічки коментарів застосований і тут."
                  : "Шість верхніх категорій — та сама розбивка, що в ручному звіті."
              }
            >
              <RankedBars data={problemCats} kind="int" highlightTop={3} />
            </Panel>

            <Panel
              title="Теми детально"
              metric="Про що пишуть"
              note="Детальніший рівень усередині категорій — те, з чим уже можна йти до підрядника."
            >
              <RankedBars
                data={problemThemes.slice(0, 12)}
                kind="int"
                highlightTop={3}
              />
            </Panel>
          </div>

          <Panel
            title="Рівень критичності"
            note="Частка негативних (1–3) серед тих, хто взагалі залишив коментар. Показані ЖК із 10+ коментарями."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ЖК</TableHead>
                  <TableHead className="text-right">Коментарів</TableHead>
                  <TableHead className="text-right">Негативних</TableHead>
                  <TableHead className="text-right">Частка</TableHead>
                  <TableHead className="w-28">Рівень</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criticality.map((c) => {
                  const level =
                    c.share >= 0.8
                      ? { label: "Критичний", tone: "var(--status-critical)" }
                      : c.share >= 0.6
                        ? { label: "Високий", tone: "var(--status-warning)" }
                        : { label: "Середній", tone: "var(--status-good)" };
                  return (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(c.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(c.negative)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(c.share, 0)}
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                          style={{
                            background: `color-mix(in oklab, ${level.tone} 15%, transparent)`,
                            color: level.tone,
                          }}
                        >
                          {level.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Коментарі"
          lead={
            <>
              Те, заради чого опитування взагалі проводять: цифра каже «
              {n1(avgLatest ?? 0)}», а що саме не так — видно тільки з тексту.{" "}
              <Hl>{n(feed.length)}</Hl> коментарів за поточним фільтром із{" "}
              <Hl>{n(allComments.length)}</Hl> усього. Фільтри пишуться в
              посилання — його можна переслати керівнику ЖК як є.
            </>
          }
        >
          <Panel
            title="Коментарі"
            note={`Показані ${Math.min(feed.length, FEED_LIMIT)} найсвіжіших; повний набір за фільтром — в Excel. Персональних даних немає: найдрібніший розріз — будинок.`}
            action={
              <ExportXlsx
                fileName="dim9000-csat-comments"
                sheetName="Коментарі"
                sheet={buildSheet(feed, [
                  { header: "Дата", value: (c) => c.answered_on, width: 12 },
                  { header: "ЖК", value: (c) => c.complex_name, width: 22 },
                  { header: "Будинок", value: (c) => c.house_address, width: 32 },
                  { header: "Хвиля", value: (c) => c.wave_label, width: 30 },
                  { header: "Оцінка", value: (c) => c.grade },
                  { header: "Теми", value: (c) => c.themes.replace(/\|/g, ", "), width: 34 },
                  { header: "Коментар", value: (c) => c.comment, width: 80 },
                ])}
              />
            }
          >
            <div className="flex flex-col gap-3 px-1 py-1">
              <CsatFilters
                complexes={complexOptions}
                themes={themeOptions}
                grades={[
                  { value: "low", label: "1–2" },
                  { value: "mid", label: "3" },
                  { value: "high", label: "4–5" },
                ]}
                activeComplex={activeComplex}
                activeTheme={activeTheme}
                activeGrade={activeGrade}
              />

              {feed.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  За цим фільтром коментарів немає.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {feed.slice(0, FEED_LIMIT).map((c) => (
                    <li
                      key={c.answer_id}
                      className="flex flex-col gap-1.5 rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span
                          className="inline-flex size-5 items-center justify-center rounded-md font-semibold tabular-nums"
                          style={{
                            background:
                              c.grade <= 2
                                ? "color-mix(in oklab, var(--status-critical) 16%, transparent)"
                                : c.grade === 3
                                  ? "color-mix(in oklab, var(--status-warning) 16%, transparent)"
                                  : "color-mix(in oklab, var(--status-good) 16%, transparent)",
                            color:
                              c.grade <= 2
                                ? "var(--status-critical)"
                                : c.grade === 3
                                  ? "var(--status-warning)"
                                  : "var(--status-good)",
                          }}
                        >
                          {c.grade}
                        </span>
                        <span className="font-medium text-foreground">
                          {c.complex_name}
                        </span>
                        <span>{c.house_address}</span>
                        <span>·</span>
                        <span>{c.survey_category_ua}</span>
                        <span>·</span>
                        <span>{c.answered_on}</span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {c.comment}
                      </p>
                      {c.themes && (
                        <div className="flex flex-wrap gap-1">
                          {c.themes.split("|").map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] font-normal"
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
