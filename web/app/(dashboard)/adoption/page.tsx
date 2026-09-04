import {
  adoptionRollup,
  getAdoptionByHouse,
  getAdoptionFunnel,
  getPeriod,
  type AdoptionHouseMonthly,
} from "@/lib/data";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { FunnelFlow } from "@/components/funnel-flow";
import { RankedBars } from "@/components/ranked-bars";
import { BklitLine } from "@/components/bklit-line";
import { requireAccess } from "@/lib/guard";

/**
 * Найменший знаменник, на якому ще можна показувати частку.
 *
 * Провізіонінг НЕ є разовим сплеском при здачі будинку: у піковий місяць
 * осідає в середньому 24% мешканців, решта докуповує квартири роками. Тому
 * на грануляції «будинок × місяць» більшість клітинок має менш ніж 20 людей,
 * і відсоток там стрибав би від 0 до 100 на п'яти особах.
 *
 * Той самий принцип, що MIN_RATE_BASE на /health і поріг «мало даних» на
 * /operations/nps: краще чесне «—», ніж точна на вигляд цифра з шуму.
 */
const MIN_BASE = 20;

/**
 * Друга умова, без якої першої НЕ ВИСТАЧАЄ: яка частка когорти вже дозріла.
 *
 * Знайдено на живих даних. Серпень 2026: провізіоновано 224 особи, вікно 30
 * днів минуло у 22 з них — знаменник ≥ 20, поріг пройдено, і графік малював
 * 68,2%. Але це 10% когорти: ті, кому завели рахунок у перші чотири дні
 * місяця. Точка стрибала вгору на правому краї — рівно той артефакт, проти
 * якого й задумувалась зрілість.
 *
 * Тому вимагаємо, щоб вікно минуло щонайменше у 80% когорти. Інакше «—».
 */
const MIN_COVERAGE = 0.8;

/**
 * Частку показуємо, лише коли вона спирається і на достатній знаменник, і на
 * достатнє покриття когорти. `null` малюється як «—» / пропущена точка.
 */
const reliable = (
  rate: number | null,
  mature: number,
  provisioned: number
): number | null =>
  mature >= MIN_BASE && provisioned > 0 && mature / provisioned >= MIN_COVERAGE
    ? rate
    : null;

/** Частка як текст: «—», якщо на неї не можна спиратись. */
const fmtRate = (rate: number | null, mature: number, provisioned: number) => {
  const v = reliable(rate, mature, provisioned);
  return v === null ? "—" : pct(v);
};

/** Місяці, за які беремо ряд випереджального показника. */
const TREND_MONTHS = 24;

export default async function AdoptionPage({ searchParams }: PageProps<"/adoption">) {
  await requireAccess("/adoption");
  const sp = await searchParams;
  const { curKey, prevKey, isPartial, daysElapsed, daysInMonth, bounds, range } =
    getPeriod(sp);

  const funnel = getAdoptionFunnel();
  const byHouse = getAdoptionByHouse();

  // ── Стан бази на обраний місяць ───────────────────────────────────────
  const atMonth = (k: string) => funnel.filter((r) => r.report_month_key === k);
  const sum = (rows: ReturnType<typeof atMonth>, f: (r: (typeof rows)[number]) => number) =>
    rows.reduce((a, r) => a + f(r), 0);

  const cur = atMonth(curKey);
  const prev = atMonth(prevKey);

  const potential = sum(cur, (r) => r.n_potential);
  const registered = sum(cur, (r) => r.n_registered);
  const visitors = sum(cur, (r) => r.n_visitors);
  const coreActive = sum(cur, (r) => r.n_core_active);
  const never = sum(cur, (r) => r.n_never_registered);

  const prevRegistered = sum(prev, (r) => r.n_registered);
  const prevPotential = sum(prev, (r) => r.n_potential);
  const rateReg = potential > 0 ? registered / potential : null;
  const ratePrevReg = prevPotential > 0 ? prevRegistered / prevPotential : null;

  // ── Швидкість підключення за обраний період провізіонінгу ─────────────
  // Вікно періоду тут означає МІСЯЦЬ ПРОВІЗІОНІНГУ, а не звітний місяць:
  // питання «як швидко підключаються ті, кому завели акаунт» прив'язане до
  // моменту заведення, а не до того, коли ми на це дивимось.
  const inRange = (r: AdoptionHouseMonthly) =>
    r.provision_month_key >= range.from && r.provision_month_key <= range.to;

  const periodRows = byHouse.filter(inRange);
  const roll = adoptionRollup(periodRows);
  const apartments = adoptionRollup(periodRows.filter((r) => r.property_kind === "apartment"));
  const commercial = adoptionRollup(periodRows.filter((r) => r.property_kind === "commercial"));

  // ── Ряд випереджального показника по місяцях провізіонінгу ────────────
  const months = [...new Set(byHouse.map((r) => r.provision_month_key))].sort();
  const trend = months.slice(-TREND_MONTHS).map((m) => {
    const r = adoptionRollup(byHouse.filter((x) => x.provision_month_key === m));
    return {
      month: m,
      // `null` пропускає точку, а не малює нуль: місяць, у якому ще ніхто не
      // дозрів до вікна, — це відсутність виміру, і провалена лінія в кінці
      // графіка щоразу читалась би як «процес зламався».
      d7: reliable(r.rate7, r.mature7, r.provisioned),
      d30: reliable(r.rate30, r.mature30, r.provisioned),
      d90: reliable(r.rate90, r.mature90, r.provisioned),
    };
  });

  // ── Антирейтинг будинків за обраний період ────────────────────────────
  const houses = new Map<string, AdoptionHouseMonthly[]>();
  for (const r of periodRows) {
    const key = r.house_id;
    houses.set(key, [...(houses.get(key) ?? []), r]);
  }
  const houseRows = [...houses.values()]
    .map((rows) => {
      const r = adoptionRollup(rows);
      return {
        address: rows[0].house_address,
        complex: rows[0].complex_name,
        opened: rows[0].house_opened_date,
        ...r,
      };
    })
    .filter((h) => reliable(h.rate7, h.mature7, h.provisioned) !== null)
    .sort((a, b) => (a.rate7 ?? 1) - (b.rate7 ?? 1));

  // ── Швидкість підключення по ЖК за обраний період ─────────────────────
  // Портфельна лінія змішує ЖК з дуже різними показниками, а склад когорти
  // місяць у місяць різний — тому її рух сам по собі ще не означає, що
  // процес змінився. Розріз по ЖК відповідає на це прямо.
  const complexSpeed = [
    ...new Map(
      periodRows.map((r) => [r.complex_name, [] as AdoptionHouseMonthly[]])
    ),
  ]
    .map(([name]) => {
      const r = adoptionRollup(
        periodRows.filter((x) => x.complex_name === name)
      );
      return { name, rate: reliable(r.rate7, r.mature7, r.provisioned), base: r.mature7 };
    })
    .filter((c): c is { name: string; rate: number; base: number } => c.rate !== null)
    .sort((a, b) => b.rate - a.rate);

  const worst = houseRows.slice(0, 12);
  const best = [...houseRows].reverse().slice(0, 5);

  // ── Накопичені непідключені по ЖК ─────────────────────────────────────
  const byComplex = new Map<string, { potential: number; never: number }>();
  for (const r of cur) {
    const hit = byComplex.get(r.complex_name) ?? { potential: 0, never: 0 };
    hit.potential += r.n_potential;
    hit.never += r.n_never_registered;
    byComplex.set(r.complex_name, hit);
  }
  const complexRows = [...byComplex.entries()]
    .map(([name, v]) => ({ name, ...v, share: v.potential > 0 ? v.never / v.potential : 0 }))
    .sort((a, b) => b.never - a.never);

  const bucketTotal =
    roll.buckets.d0 + roll.buckets.d1_7 + roll.buckets.d8_30 +
    roll.buckets.d31_90 + roll.buckets.d90plus + roll.buckets.never;

  return (
    <>
      <PageHeader
        title="Підключення"
        subtitle="Чи доходить мешканець із особовим рахунком до застосунку"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Є особовий рахунок"
            value={n(potential)}
            sub={`${monthLabel(curKey)}`}
            metric="Потенційні користувачі"
          />
          <Kpi
            label="Зареєструвались"
            value={rateReg !== null ? pct(rateReg) : "—"}
            sub={`${n(registered)} осіб`}
            trend={
              rateReg !== null && ratePrevReg !== null
                ? { text: pp(rateReg - ratePrevReg), good: rateReg >= ratePrevReg }
                : undefined
            }
            metric="Частка зареєстрованих"
          />
          <Kpi
            label="Жодного разу не заходили"
            value={n(never)}
            sub="накопичено за всю історію"
            trend={{
              text: delta(never / (prevPotential - prevRegistered) - 1),
              // Зростання цього числа — погано, тому знак інвертований.
              good: never <= prevPotential - prevRegistered,
            }}
            metric="Непідключені мешканці"
          />
          <Kpi
            label="Реєстрація за 7 днів"
            value={fmtRate(roll.rate7, roll.mature7, roll.provisioned)}
            sub={`з ${n(roll.mature7)} за обраний період`}
            metric="Реєстрація за 7 днів"
          />
        </div>

        <Section
          title="Воронка прийняття"
          lead={
            <>
              З <Hl>{n(potential)}</Hl> мешканців, яким УК завела особовий
              рахунок, до застосунку дійшли <Hl>{n(registered)}</Hl> —{" "}
              <Hl>{rateReg !== null ? pct(rateReg) : "—"}</Hl>. Заходили{" "}
              {monthLabel(curKey)} <Hl>{n(visitors)}</Hl>, цільову дію зробили{" "}
              <Hl>{n(coreActive)}</Hl>. Найбільша втрата — на першому кроці:{" "}
              <Hl>{n(never)}</Hl> людей, за яких УК уже відповідає й яким уже
              виставляє рахунки, застосунок не відкривали жодного разу.
            </>
          }
        >
          <Panel
            title={`Воронка прийняття — ${monthLabel(curKey)}`}
            metric={[
              "Потенційні користувачі",
              "Частка зареєстрованих",
              "Непідключені мешканці",
            ]}
            note={
              "Кожен мешканець рахується рівно один раз і потрапляє рівно в один будинок (основне приміщення: житло важливіше за комерцію/паркінг). Тому суму по будинках можна згортати до ЖК і до тоталу — на це стоїть тест, який щоночі звіряє цю вітрину зі Стор. 1." +
              (isPartial
                ? ` ⚠️ Місяць ще триває (${daysElapsed} з ${daysInMonth} днів), тому два нижні кроки неповні: «є рахунок» і «зареєструвались» — це стан бази, а «заходили» й «цільова дія» встигли накопичитись лише за кілька днів. Порівнювати їхні частки з попередніми місяцями не можна.`
                : "")
            }
          >
            <FunnelFlow
              steps={[
                { label: "Є особовий рахунок", value: potential },
                { label: "Зареєструвались", value: registered },
                { label: `Заходили в ${monthLabel(curKey)}`, value: visitors },
                { label: "Цільова дія", value: coreActive },
              ]}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Накопичені непідключені по ЖК"
              metric="Непідключені мешканці"
              note="Скільки людей з особовим рахунком так і не зареєструвались. Це окрема задача від полагодження потоку: виправлення процесу допоможе тільки тим, кого передадуть завтра."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-xs">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 text-left font-medium">ЖК</th>
                      <th className="px-2 py-2 text-right font-medium">Мешканців</th>
                      <th className="px-2 py-2 text-right font-medium">Не підключені</th>
                      <th className="px-2 py-2 text-right font-medium">Частка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complexRows.map((c) => (
                      <tr key={c.name} className="border-b last:border-0">
                        <td className="px-2 py-1.5">{c.name}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{n(c.potential)}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{n(c.never)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {pct(c.share)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="Скільки часу минає до першого входу"
              metric="Час до першого входу"
              note="Від заведення особового рахунку до першої події в застосунку. Тільки акаунти від 2024-01 — у verified немає відмітки часу, тому дата реєстрації наближається першою подією в Amplitude, а раніше 2024-го подій фактично немає."
            >
              <RankedBars
                kind="int"
                highlightTop={0}
                data={[
                  { label: "У той самий день", value: roll.buckets.d0 },
                  { label: "1–7 днів", value: roll.buckets.d1_7 },
                  { label: "8–30 днів", value: roll.buckets.d8_30 },
                  { label: "31–90 днів", value: roll.buckets.d31_90 },
                  { label: "Пізніше 90 днів", value: roll.buckets.d90plus },
                  { label: "Жодного разу", value: roll.buckets.never },
                ]}
              />
              <p className="px-2 pt-2 text-[11px] text-muted-foreground">
                Разом {n(bucketTotal)} осіб, яким завели рахунок у обраному
                періоді.
              </p>
            </Panel>
          </div>
        </Section>

        <Section
          title="Випереджальний показник"
          lead={
            <>
              Накопичена частка зареєстрованих реагує на зміни роками. Частка
              тих, хто зайшов за перший тиждень після заведення рахунку,
              реагує одразу — і саме вона показує, чи працює процес передачі
              будинку <em>зараз</em>. За обраний період це{" "}
              <Hl>{fmtRate(roll.rate7, roll.mature7, roll.provisioned)}</Hl> за
              тиждень і{" "}
              <Hl>{fmtRate(roll.rate90, roll.mature90, roll.provisioned)}</Hl> за
              три місяці. Квартири підключаються помітно краще за комерцію та
              паркінги:{" "}
              <Hl>{fmtRate(apartments.rate7, apartments.mature7, apartments.provisioned)}</Hl>{" "}
              проти{" "}
              <Hl>{fmtRate(commercial.rate7, commercial.mature7, commercial.provisioned)}</Hl>.
            </>
          }
        >
          <Panel
            title="Реєстрація за 7 / 30 / 90 днів від заведення рахунку"
            metric="Реєстрація за 7 днів"
            note={`Вимір за МІСЯЦЕМ ПРОВІЗІОНІНГУ, а не звітним. Точка малюється тільки там, де вікно вже минуло щонайменше в ${MIN_BASE} осіб І щонайменше у ${Math.round(MIN_COVERAGE * 100)}% когорти місяця. Без другої умови правий край брехав: у серпні 2026 тридцятиденне вікно минуло лише в 22 осіб з 224, і графік малював по них 68%. ⚠️ Лінія портфельна, а склад когорти щомісяця різний: липневий провал значною мірою дала «Галактика» (51 особа, 13,7%), серпневий підйом — «Варшавський 3» і «Окленд». Рух лінії сам по собі ще не означає, що процес змінився, — дивись розріз по ЖК поруч.`}
          >
            <BklitLine
              kind="pct"
              aspectRatio="3 / 1"
              data={trend as unknown as Array<Record<string, string | number>>}
              series={[
                { key: "d7", label: "За 7 днів", slot: 1 },
                { key: "d30", label: "За 30 днів", slot: 2 },
                { key: "d90", label: "За 90 днів", slot: 3 },
              ]}
            />
          </Panel>

          <Panel
            title="Реєстрація за 7 днів по ЖК"
            metric="Реєстрація за 7 днів"
            note="За весь обраний період, тому склад когорти вже не заважає порівнювати. ЖК, де дозріло замало людей, у списку немає."
          >
            <RankedBars
              kind="pct"
              data={complexSpeed.map((c) => ({ label: c.name, value: c.rate }))}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Будинки, де підключення йде найгірше"
              metric="Реєстрація за 7 днів"
              note={`Частка тих, хто зайшов за перший тиждень. Будинки, де в обраному періоді менш ніж ${MIN_BASE} дозрілих мешканців або дозріло менш ніж ${Math.round(MIN_COVERAGE * 100)}% когорти, у рейтингу не показані — на п'яти особах відсоток не вимір.`}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-xs">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 text-left font-medium">Будинок</th>
                      <th className="px-2 py-2 text-right font-medium">Осіб</th>
                      <th className="px-2 py-2 text-right font-medium">7 днів</th>
                      <th className="px-2 py-2 text-right font-medium">90 днів</th>
                      <th className="px-2 py-2 text-right font-medium">Не зайшли</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worst.map((h) => (
                      <tr key={h.address} className="border-b last:border-0">
                        <td className="px-2 py-1.5">
                          <div className="truncate" title={h.address}>{h.address}</div>
                          <div className="text-[10px] text-muted-foreground">{h.complex}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{n(h.mature7)}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{pct(h.rate7)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {fmtRate(h.rate90, h.mature90, h.provisioned)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {pct(h.rateNever)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="Будинки, де підключення йде найкраще"
              metric="Реєстрація за 7 днів"
              note="Це не грамота, а список, у якого треба питати. Різниця між сусідніми будинками одного ЖК, переданими в один день, доходила до півтора разів — значить різниться процедура, а не продукт."
            >
              <RankedBars
                kind="pct"
                data={best.map((h) => ({
                  label: `${h.address}`,
                  value: h.rate7 ?? 0,
                }))}
              />
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
