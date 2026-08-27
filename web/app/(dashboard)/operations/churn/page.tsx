import {
  getCampaigns,
  getChurnPeriod,
  getHouses,
  type Campaign,
  type HouseMonthly,
} from "@/lib/data-operational";
import { monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { BklitLine } from "@/components/bklit-line";
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
import { requireAccess } from "@/lib/guard";

/** Ключ будинку: house_id у вивантаження не їде (36 символів × 1 344 рядки). */
const houseKey = (h: { complex_name: string; house_number: string }) =>
  `${h.complex_name} ${h.house_number}`;

/**
 * Колір стадії. Стадії 4-5 — критичні, 3 — попередження, 2 і нижче —
 * нейтральні: на цьому етапі це ще робота сервісу, а не втрата будинку.
 */
function stageTone(stage: number): string | undefined {
  if (stage >= 4) return "var(--status-critical)";
  if (stage === 3) return "var(--status-warning)";
  return undefined;
}

function moodTone(mood: string): string | undefined {
  if (mood === "Ризиковий") return "var(--status-critical)";
  if (mood === "Напружений") return "var(--status-warning)";
  return undefined;
}

/** Через що будинок потрапив у чергу — людською мовою, а не набором колонок. */
function drivers(h: HouseMonthly): string[] {
  const out: string[] = [];
  if (h.osbb_intent_12m > 0) out.push(`ОСББ у тексті (${h.osbb_intent_12m})`);
  if (h.campaigns_esc_3m > 0)
    out.push(
      `кампанії: ${h.campaigns_esc_3m}, учасників ${h.campaign_people_esc_3m}`
    );
  // Гістерезис: кампанія могла вийти за тримісячне вікно, але група нікуди
  // не поділась. Без цього рядка будинок 10 «Варшавський Плюс» за місяць до
  // виходу виглядав у таблиці як звичайне роздратування.
  if (h.campaigns_esc_3m === 0 && h.risk_stage_max_6m >= 3 && h.risk_stage < 3)
    out.push(`була організація за півроку (стадія ${h.risk_stage_max_6m})`);
  if (h.legal_3m > 0) out.push(`юридичних заявок: ${h.legal_3m}`);
  if (h.n_revolutionary > 0) out.push(`революціонерів: ${h.n_revolutionary}`);
  else if (h.n_restless_plus >= 3)
    out.push(`напружених мешканців: ${h.n_restless_plus}`);
  if (h.reviews_3m >= 5 && (h.low_rating_share_3m ?? 0) > 0.6)
    out.push(`оцінок 1–2: ${pct(h.low_rating_share_3m)}`);
  // Падіння показуємо не лише при `is_fading`: на стадію 5 будинок потрапляє
  // через обвал два місяці поспіль, і без цього рядка колонка «через що» у
  // найтривожнішого рядка таблиці лишалась порожньою.
  const drop = h.engagement_drop ?? 0;
  if (drop >= 0.3)
    out.push(
      `${h.is_fading ? "згасання" : "падіння активності"}: −${pct(drop, 0)} до своєї бази`
    );
  return out;
}

export default async function ChurnPage({ searchParams }: PageProps<"/operations/churn">) {
  await requireAccess("/operations/churn");
  const sp = await searchParams;
  const { curKey, prevKey, bounds, range, cur, prev, base, inWindow } =
    getChurnPeriod(sp);

  const houses = getHouses();
  const queue = houses
    .filter((h) => h.report_month_key === curKey && h.needs_attention)
    .sort(
      (a, b) =>
        Math.max(b.risk_stage, b.risk_stage_max_6m) -
          Math.max(a.risk_stage, a.risk_stage_max_6m) ||
        (b.share_pctile ?? 0) - (a.share_pctile ?? 0)
    );

  // Скільки місяців будинок протримався в зоні уваги — у межах вивантаженого
  // вікна (12 місяців). Один місяць у списку і рік поспіль — різні історії,
  // і без цієї колонки вони виглядають однаково.
  const monthsFlagged = new Map<string, number>();
  for (const h of houses) {
    if (!h.needs_attention) continue;
    monthsFlagged.set(houseKey(h), (monthsFlagged.get(houseKey(h)) ?? 0) + 1);
  }
  const windowMonths = new Set(houses.map((h) => h.report_month_key)).size;

  const allCampaigns = getCampaigns();
  const escalation = allCampaigns.filter(
    (c) => c.has_legal || c.has_collective || c.has_osbb_intent
  );
  const recent = escalation
    .filter((c) => c.started_at.slice(0, 7) <= curKey)
    .slice(0, 14);
  const benignShare = 1 - escalation.length / allCampaigns.length;

  const apartments = queue.reduce((s, h) => s + h.n_apartments, 0);
  const stage4plus = queue.filter((h) => h.risk_stage >= 4);
  const fadingOnly = queue.filter((h) => h.is_fading && h.risk_stage < 2);
  // Будинки, які тримає в черзі ЛИШЕ склад населення: сходинка спокійна,
  // згасання немає, але напружених мешканців більше, ніж деінде.
  const moodOnly = queue.filter(
    (h) => h.risk_stage < 2 && !h.is_fading && h.risk_stage_max_6m < 3
  );
  const d = (a: number, b: number) =>
    `${a - b >= 0 ? "+" : "−"}${Math.abs(a - b)}`;

  return (
    <>
      <PageHeader
        title="Ризик відтоку"
        subtitle="Будинки, які рухаються до виходу з-під управління"
        monthKey={curKey}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi
            label="Будинків у зоні уваги"
            value={n(cur.houses_attention)}
            sub={`з ${n(cur.houses_total)} · квартир: ${n(apartments)}`}
            trend={{
              text: `${d(cur.houses_attention, prev.houses_attention)} до ${monthLabel(prevKey)}`,
              good: cur.houses_attention <= prev.houses_attention,
            }}
          />
          <Kpi
            label="Організація і вище"
            value={n(cur.houses_stage3plus)}
            sub="стадії 3–5: є група або заявлений намір"
            trend={{
              text: d(cur.houses_stage3plus, prev.houses_stage3plus),
              good: cur.houses_stage3plus <= prev.houses_stage3plus,
            }}
          />
          <Kpi
            label="Ризикові будинки"
            value={n(cur.houses_risky)}
            sub={`за складом населення · напружених ще ${n(cur.houses_tense)}`}
            trend={{
              text: d(cur.houses_risky, prev.houses_risky),
              good: cur.houses_risky <= prev.houses_risky,
            }}
          />
          <Kpi
            label="Будинків у згасанні"
            value={n(cur.houses_fading)}
            sub={`з них без конфлікту — ${n(cur.houses_fading_only)}`}
            trend={{
              text: d(cur.houses_fading, prev.houses_fading),
              good: cur.houses_fading <= prev.houses_fading,
            }}
          />
          <Kpi
            label="Частка оцінок 1–2"
            value={pct(cur.low_rating_share)}
            sub="по портфелю, ковзні 3 місяці"
            trend={{
              text: pp((cur.low_rating_share ?? 0) - (prev.low_rating_share ?? 0)),
              good: (cur.low_rating_share ?? 0) <= (prev.low_rating_share ?? 0),
            }}
          />
        </div>

        <Section
          title="Три осі ризику"
          lead={
            <>
              У {monthLabel(curKey)} уваги потребують{" "}
              <Hl>{n(cur.houses_attention)}</Hl> будинків із{" "}
              <Hl>{n(cur.houses_total)}</Hl>, разом <Hl>{n(apartments)}</Hl>{" "}
              квартир. На стадії «організація» і вище —{" "}
              <Hl>{n(cur.houses_stage3plus)}</Hl>
              {stage4plus.length > 0 && (
                <>
                  , з них <Hl>{n(stage4plus.length)}</Hl> уже із заявленим
                  наміром вийти
                </>
              )}
              .
              {fadingOnly.length > 0 && (
                <>
                  {" "}
                  Ще <Hl>{n(fadingOnly.length)}</Hl> згасають без жодного
                  конфлікту — люди просто перестали писати.
                </>
              )}
              {moodOnly.length > 0 && (
                <>
                  {" "}
                  <Hl>{n(moodOnly.length)}</Hl> будинків тримає в черзі лише
                  склад населення: сходинка спокійна, але напружених мешканців
                  більше, ніж у 95% портфеля.
                </>
              )}
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Будинки за стадіями конфлікту"
              metric={["Будинків у зоні уваги", "Організація і вище"]}
              note="Стадії 0–5: норма → роздратування → юридизація → організація → намір → пішли. Ряд стрибкий навмисно: одна кампанія на весь ЖК піднімає всі його будинки одночасно — так у липні 2026 одне звернення про протипожежну систему перевело 11 будинків у «організацію» за два дні."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  attention: r.houses_attention,
                  stage3plus: r.houses_stage3plus,
                  fading: r.houses_fading_only,
                }))}
                series={[
                  { key: "attention", label: "Потребують уваги", slot: 1 },
                  { key: "stage3plus", label: "Організація і вище", slot: 2 },
                  { key: "fading", label: "Лише згасання", slot: 3 },
                ]}
              />
            </Panel>

            <Panel
              title="Будинки за складом населення"
              metric="Ризикові будинки"
              note="Друга вісь: не що відбувається, а хто живе. Настрій — перцентиль частки напружених мешканців усередині портфеля на місяць; знаменник — активні мешканці, не квартири. З квартирами пороги недосяжні: максимум по портфелю 4,8%."
            >
              <BklitLine
                aspectRatio="2 / 1"
                data={inWindow(base).map((r) => ({
                  month: r.report_month_key,
                  risky: r.houses_risky,
                  tense: r.houses_tense,
                  noisy: r.houses_noisy,
                }))}
                series={[
                  { key: "risky", label: "Ризикові", slot: 1 },
                  { key: "tense", label: "Напружені", slot: 2 },
                  { key: "noisy", label: "Шумні", slot: 3 },
                ]}
              />
            </Panel>
          </div>
        </Section>

        <Section
          title="Черга роботи"
          lead={
            <>
              Відсортовано за стадією з урахуванням гістерезису: у чергу
              рахується максимум за півроку, а не поточний місяць. Причина
              конкретна — будинок 10 «Варшавський Плюс» за місяць до виходу
              випадав зі списку, бо кампанія вийшла за тримісячне вікно.
              «Місяців поспіль» рахується у вікні {windowMonths} місяців.
            </>
          }
        >
          <Panel
            title={`Будинки, що потребують уваги — ${monthLabel(curKey)}`}
            metric="Будинків у зоні уваги"
            note="Стадія 5 і згасання — це фіксація факту, а не прогноз: там уже треба перевіряти руками, чи будинок ще наш."
            action={
              <ExportXlsx
                fileName={`dim9000-churn-${curKey}`}
                sheetName="Ризик відтоку"
                sheet={buildSheet(queue, [
                  { header: "ЖК", value: (h) => h.complex_name, width: 24 },
                  { header: "Будинок", value: (h) => h.house_number },
                  { header: "Квартир", value: (h) => h.n_apartments },
                  { header: "Стадія", value: (h) => h.risk_stage_ua, width: 18 },
                  {
                    header: "Стадія макс. за 6 міс",
                    value: (h) => h.risk_stage_max_6m,
                    width: 20,
                  },
                  { header: "Настрій", value: (h) => h.house_mood, width: 14 },
                  {
                    header: "Активних мешканців",
                    value: (h) => h.n_active_residents,
                    width: 18,
                  },
                  {
                    header: "Напружених",
                    value: (h) => h.n_restless_plus,
                    width: 14,
                  },
                  {
                    header: "Революціонерів",
                    value: (h) => h.n_revolutionary,
                    width: 16,
                  },
                  {
                    header: "Приріст напруги за 3 міс",
                    value: (h) => h.contagion_3m,
                    format: "0.0%",
                    width: 22,
                  },
                  {
                    header: "Місяців поспіль",
                    value: (h) => monthsFlagged.get(houseKey(h)) ?? 0,
                    width: 16,
                  },
                  {
                    header: "Кампаній за 3 міс",
                    value: (h) => h.campaigns_esc_3m,
                    width: 18,
                  },
                  {
                    header: "Учасників кампаній",
                    value: (h) => h.campaign_people_esc_3m,
                    width: 18,
                  },
                  {
                    header: "Юридичних заявок",
                    value: (h) => h.legal_3m,
                    width: 18,
                  },
                  {
                    header: "Згадок ОСББ за рік",
                    value: (h) => h.osbb_intent_12m,
                    width: 18,
                  },
                  {
                    header: "Оцінок 1–2",
                    value: (h) => h.low_rating_share_3m,
                    format: "0.0%",
                    width: 14,
                  },
                  {
                    header: "Падіння активності",
                    value: (h) => h.engagement_drop,
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
                  <TableHead>Будинок</TableHead>
                  <TableHead>Стадія</TableHead>
                  <TableHead>Настрій</TableHead>
                  <TableHead className="text-right">Квартир</TableHead>
                  <TableHead className="text-right">Місяців поспіль</TableHead>
                  <TableHead>Через що</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((h) => (
                  <TableRow key={houseKey(h)}>
                    <TableCell className="font-medium">
                      {h.complex_name}{" "}
                      <span className="text-muted-foreground">
                        {h.house_number}
                      </span>
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap"
                      style={{ color: stageTone(h.risk_stage) }}
                    >
                      {h.risk_stage >= 2
                        ? h.risk_stage_ua
                        : h.risk_stage_max_6m >= 3
                          ? `була ${h.risk_stage_max_6m} за півроку`
                          : h.is_fading
                            ? "— згасання"
                            : "— склад"}
                    </TableCell>
                    <TableCell
                      className="text-xs whitespace-nowrap"
                      style={{ color: moodTone(h.house_mood) }}
                    >
                      {h.house_mood}
                      {h.share_pctile !== null && (
                        <span className="text-muted-foreground">
                          {" · "}
                          {pct(h.share_restless_plus, 0)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n(h.n_apartments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {monthsFlagged.get(houseKey(h)) ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {drivers(h).join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Section>

        <Section
          title="Кампанії"
          lead={
            <>
              У реєстрі <Hl>{n(allCampaigns.length)}</Hl> — стільки разів троє й
              більше мешканців одного ЖК подали заявки майже однаковим текстом
              за два тижні. Але це синхронність, а не тиск:{" "}
              <Hl>{pct(benignShare, 0)}</Hl> — побутові збіги на кшталт
              «перезапустіть котельню» від пʼятьох за годину. У стадію
              рахуються лише <Hl>{n(escalation.length)}</Hl> ескалаційних — з
              юридичними вимогами, зверненням від імені групи або згадкою ОСББ.
            </>
          }
        >
          <Panel
            title="Ескалаційні кампанії"
            note="Останні 14. Дефолтна дія — одна письмова відповідь на кампанію всім учасникам: 13 із 20 найбільших дослівно вимагають саме її."
            action={
              <ExportXlsx
                fileName={`dim9000-campaigns-${curKey}`}
                sheetName="Кампанії"
                sheet={buildSheet(escalation, [
                  {
                    header: "Дата",
                    value: (c: Campaign) => c.started_at,
                    width: 12,
                  },
                  {
                    header: "ЖК",
                    value: (c: Campaign) => c.complex_name,
                    width: 24,
                  },
                  {
                    header: "Будинки",
                    value: (c: Campaign) => c.houses,
                    width: 30,
                  },
                  { header: "Людей", value: (c: Campaign) => c.n_people },
                  { header: "Заявок", value: (c: Campaign) => c.n_orders },
                  {
                    header: "Юридична",
                    value: (c: Campaign) => (c.has_legal ? "так" : ""),
                    width: 12,
                  },
                  {
                    header: "Від імені групи",
                    value: (c: Campaign) => (c.has_collective ? "так" : ""),
                    width: 16,
                  },
                  {
                    header: "Згадка ОСББ",
                    value: (c: Campaign) => (c.has_osbb_intent ? "так" : ""),
                    width: 14,
                  },
                  {
                    header: "Текст",
                    value: (c: Campaign) => c.sample_text,
                    width: 80,
                  },
                ])}
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Дата</TableHead>
                  <TableHead>ЖК і будинки</TableHead>
                  <TableHead className="text-right">Людей</TableHead>
                  <TableHead>Звернення</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((c) => (
                  <TableRow key={c.campaign_id}>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {c.started_at}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.complex_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.houses}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {c.n_people}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-xl text-xs leading-snug text-muted-foreground">
                        {c.sample_text}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.has_osbb_intent && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px]"
                            style={{ color: "var(--status-critical)" }}
                          >
                            ОСББ
                          </Badge>
                        )}
                        {c.has_collective && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            від імені групи
                          </Badge>
                        )}
                        {c.has_legal && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px]"
                          >
                            юридична вимога
                          </Badge>
                        )}
                      </div>
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
