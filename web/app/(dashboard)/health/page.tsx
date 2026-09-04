import {
  getAppErrorSummary,
  getAppErrorsMonthly,
  getAppErrorsWeekly,
  getAppHealth,
  getPeriod,
} from "@/lib/data";
import { delta, monthLabel, n, n1, pct, pp, weekTooltip } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Narrative } from "@/components/narrative";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { HealthFilters } from "@/components/health-filters";
import { BklitLine } from "@/components/bklit-line";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAccess } from "@/lib/guard";

/** "1.12.3" → [1,12,3], для сортування версій по-людськи, не рядком */
function versionKey(v: string): number[] {
  return v.split(".").map((n) => Number(n) || 0);
}
function compareVersions(a: string, b: string): number {
  const ka = versionKey(a);
  const kb = versionKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (kb[i] ?? 0) - (ka[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

type WeekAgg = {
  week: string;
  wau: number;
  logout: number;
  bioTotal: number;
  friction: number;
  fallback: number;
};

/**
 * Мінімальний знаменник, щоб рахувати частку.
 *
 * Без цього графік біометрії був порожнім, і виглядало це як зламаний
 * компонент. Насправді ламали дані: у 2024 застосунком користувались
 * одиниці, і тиждень, де біометрію бачила ОДНА людина, а поп-ап не
 * показався, давав чесні 100%. Дві такі точки задирали вісь до 100%, а
 * реальний сигнал (4-5%) лягав у нуль і ставав невидимим.
 *
 * 100 — не магія: на меншій базі довірчий інтервал частки ширший за сам
 * сигнал (±10 п.п. проти 4-5%), тобто точка не несе інформації. Тижні з
 * малою базою лишаються на графіку активних (там знаменника немає), але
 * частку по них не малюємо.
 */
const MIN_RATE_BASE = 100;

/**
 * Мінімальна аудиторія версії, щоб рахувати її частку помилок.
 *
 * Без порога «найгірший реліз» назавжди дістається версіям, якими користуються
 * десятки людей: при 26 активних ОДИН зачеплений — це 3,8%, і такі рядки
 * витісняють із топу справжні поломки на релізах із тисячами користувачів.
 * Перевірено на даних: верхівка рейтингу без порога складалась виключно з
 * версій на 26-50 активних, кожна з одним зачепленим.
 */
const MIN_VERSION_BASE = 100;

/**
 * Скільки останніх тижнів показує блок релізів.
 *
 * Той самий прийом і та сама підстава, що в зведених таблицях операційного
 * SLA («13 останніх місяців»): рейтинг за весь період відповідає на питання
 * «коли нам було найгірше за всю історію», а не «що зламано зараз».
 */
const RELEASE_WEEKS = 12;

/** Попередній місяць до ключа "2026-08" → "2026-07". */
function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Понеділок поточного тижня — ключ `event_week` у марті (тижні там
 * починаються з понеділка, перевірено на даних).
 */
function currentWeekKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default async function HealthPage({
  searchParams,
}: PageProps<"/health">) {
  await requireAccess("/health");
  const sp = await searchParams;
  const { curKey, isPartial, daysElapsed, daysInMonth, bounds, range } =
    getPeriod(sp);

  const rawOs = typeof sp.os === "string" ? sp.os : "all";
  const os: "all" | "android" | "ios" =
    rawOs === "android" || rawOs === "ios" ? rawOs : "all";
  const version = typeof sp.version === "string" ? sp.version : "all";

  const healthAll = getAppHealth();
  const versions = [...new Set(healthAll.map((r) => r.app_version))].sort(
    compareVersions
  );

  const filtered = healthAll.filter((r) => {
    const weekMonth = r.event_week.slice(0, 7);
    if (weekMonth < range.from || weekMonth > range.to) return false;
    if (os !== "all" && r.os_type.toLowerCase() !== os) return false;
    if (version !== "all" && r.app_version !== version) return false;
    return true;
  });

  // ⚠️ Сума WAU/логаутів/біометрії по версіях у межах тижня подвійно рахує
  // юзера, який за тиждень встиг оновитись — той самий ефект, що й у
  // mart_version_adoption (CLAUDE.md). Для точного числа треба окремий
  // distinct-агрегат (як agg_os_monthly для Стр.1) — поки що немає.
  const byWeek = new Map<string, WeekAgg>();
  for (const r of filtered) {
    const acc = byWeek.get(r.event_week) ?? {
      week: r.event_week,
      wau: 0,
      logout: 0,
      bioTotal: 0,
      friction: 0,
      fallback: 0,
    };
    acc.wau += r.weekly_active_users;
    acc.logout += r.forced_logout_users;
    acc.bioTotal += r.total_bio_users;
    acc.friction += r.technical_friction_users;
    acc.fallback += r.biometric_fallback_users;
    byWeek.set(r.event_week, acc);
  }
  const weekly = [...byWeek.values()].sort((a, b) =>
    a.week.localeCompare(b.week)
  );

  // Частку рахуємо тільки там, де знаменник достатній — див. MIN_RATE_BASE.
  const withRates = weekly.map((w) => ({
    ...w,
    logoutRate: w.wau >= MIN_RATE_BASE ? w.logout / w.wau : null,
    frictionRate: w.bioTotal >= MIN_RATE_BASE ? w.friction / w.bioTotal : null,
    fallbackRate: w.bioTotal >= MIN_RATE_BASE ? w.fallback / w.bioTotal : null,
  }));

  /**
   * Картки показують ОСТАННІЙ ПОВНИЙ тиждень, а не поточний.
   *
   * Тижневу метрику незавершеного тижня немає з чим порівнювати: у вівторок
   * там один день даних, і дельта до повного тижня показала б −97% — падіння,
   * якого немає. У помісячних сторінках ми свідомо показуємо незавершений
   * місяць із позначкою «місяць триває», але там перекіс у рази, а тут — на
   * порядок. Поточний тиждень лишається на ГРАФІКАХ (останню точку видно), у
   * картках же підпис прямо називає тиждень, який рахували.
   */
  const currentWeek = currentWeekKey();
  const complete = withRates.filter((w) => w.week < currentWeek);
  const last = complete.at(-1) ?? withRates.at(-1);
  const prevWeek = complete.at(-2);
  const hasRunningWeek = withRates.at(-1)?.week === currentWeek;

  const isMixedVersions = version === "all" && versions.length > 1;

  // ── Помилки ───────────────────────────────────────────────────────────
  //
  // ⚠️ Фільтри ОС і версії тут діють ТІЛЬКИ на блок релізів. Місячні вітрини
  // помилок не мають цих вимірів у грануляції, і робити вигляд, що мають,
  // означало б показувати нефільтровані числа під активним фільтром — рівно
  // та пастка, що з пончиком статусів на операційному SLA.
  const prevKey = prevMonthKey(curKey);
  const summary = getAppErrorSummary();
  const appCur = summary.find(
    (r) => r.report_month_key === curKey && r.error_class === "app"
  );
  const appPrev = summary.find(
    (r) => r.report_month_key === prevKey && r.error_class === "app"
  );

  const kinds = getAppErrorsMonthly();
  const kindsCur = kinds
    .filter((r) => r.report_month_key === curKey)
    .sort((a, b) => b.affected_users - a.affected_users);
  const kindsPrev = new Map(
    kinds
      .filter((r) => r.report_month_key === prevKey)
      .map((r) => [r.error_kind, r])
  );
  const kind = (k: string) => kindsCur.find((r) => r.error_kind === k);

  // Тренд частки класу `app` по місяцях вибраного періоду.
  const appTrend = summary
    .filter(
      (r) =>
        r.error_class === "app" &&
        r.report_month_key >= range.from &&
        r.report_month_key <= range.to &&
        r.affected_rate != null
    )
    .sort((a, b) => a.report_month_key.localeCompare(b.report_month_key));

  // Релізи: тільки поломки на нашому боці, тільки версії з достатньою
  // аудиторією, у межах вибраного періоду й фільтрів.
  //
  // ⚠️ І ТІЛЬКИ ОСТАННІ ТИЖНІ. Без цього блок відповідав не на те питання:
  // період за замовчуванням — уся історія, сортування йде за часткою, і
  // нагору назавжди спливали найгірші тижні за всі роки. Реально показувало
  // лютий 2025 на iOS 1.1.7 («немає зʼєднання» у 30,7% з 934) — інцидент
  // справжній, але сьогодні на 1.1.7 не сидить ніхто, і вдіяти з цим нічого
  // не можна. Питання блоку — «який реліз ламається ЗАРАЗ».
  const weeksAll = [...new Set(getAppErrorsWeekly().map((r) => r.event_week))]
    .sort()
    .filter((w) => {
      const m = w.slice(0, 7);
      return m >= range.from && m <= range.to;
    });
  const weekFloor = weeksAll.at(-RELEASE_WEEKS) ?? weeksAll[0] ?? "";

  const releases = getAppErrorsWeekly()
    .filter((r) => {
      const weekMonth = r.event_week.slice(0, 7);
      if (weekMonth < range.from || weekMonth > range.to) return false;
      if (r.event_week < weekFloor) return false;
      if (r.error_class !== "app") return false;
      if (r.version_active_users < MIN_VERSION_BASE) return false;
      if (os !== "all" && r.os_type.toLowerCase() !== os) return false;
      if (version !== "all" && r.app_version !== version) return false;
      return true;
    })
    .sort((a, b) => (b.affected_rate ?? 0) - (a.affected_rate ?? 0))
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Стан додатку"
        subtitle="Помилки, релізи, авторизація"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <Narrative section="health" />

        <HealthFilters os={os} version={version} versions={versions} />

        {hasRunningWeek && last && (
          <p className="-mt-1 text-xs text-muted-foreground">
            Поточний тиждень ще триває — картки рахують останній повний
            ({weekTooltip(last?.week ?? "").toLowerCase()}). На графіках
            остання точка неповна.
          </p>
        )}

        <Section
          title="Помилки"
          lead={
            appCur ? (
              <>
                У {monthLabel(curKey)} у поломку на нашому боці вперлись{" "}
                <Hl>{n(appCur.affected_users)}</Hl> людей —{" "}
                <Hl>{pct(appCur.affected_rate)}</Hl> активних, по{" "}
                <Hl>{n1(appCur.events_per_affected)}</Hl> разів на людину.
              </>
            ) : (
              <>За {monthLabel(curKey)} даних про помилки ще немає.</>
            )
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Помилки застосунку"
              value={n(appCur?.affected_users ?? 0)}
              sub={`${pct(appCur?.affected_rate)} активних`}
              trend={
                appPrev && appCur
                  ? {
                      text: delta(
                        appCur.affected_users / appPrev.affected_users - 1
                      ),
                      good: appCur.affected_users <= appPrev.affected_users,
                    }
                  : undefined
              }
            />
            <Kpi
              label="Оплата не пройшла"
              value={n(kind("payment_fail")?.affected_users ?? 0)}
              sub={`по ${n1(kind("payment_fail")?.events_per_affected)} спроб`}
            />
            <Kpi
              label="Доступ заборонено"
              value={n(kind("access_denied")?.affected_users ?? 0)}
              sub={`місяцем раніше — ${n(kindsPrev.get("access_denied")?.affected_users ?? 0)}`}
            />
            <Kpi
              label="Екран «Щось пішло не так»"
              value={n(kind("app_failure")?.affected_users ?? 0)}
              sub={`по ${n1(kind("app_failure")?.events_per_affected)} разів на людину`}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Що саме ламається"
              metric="Людей із помилкою"
              note="«Разів на людину» читати разом із кількістю: 5 людей по 10 разів — це зламаний сценарій у вузької групи, а 500 по одному — загальна шорсткість. Класи між собою не складаються: auth — здебільшого сам користувач, access — питання до операційки."
            >
              <div className="max-h-[22rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Помилка</TableHead>
                      <TableHead>Клас</TableHead>
                      <TableHead className="text-right">Людей</TableHead>
                      <TableHead className="text-right">% активних</TableHead>
                      <TableHead className="text-right">Разів на людину</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kindsCur.map((r) => (
                      <TableRow key={r.error_kind}>
                        <TableCell
                          className="font-medium"
                          title={r.hint_ua ?? undefined}
                        >
                          {r.label_ua}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.error_class}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.affected_users)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(r.affected_rate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n1(r.events_per_affected)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel
              title="Частка з поломкою застосунку"
              metric="Помилки застосунку"
              note="Тільки клас app — екран помилки, немає зʼєднання, оплата, недоступна послуга. Тертя на вході й питання доступу сюди не входять навмисно."
            >
              <BklitLine
                data={appTrend.map((r) => ({
                  month: r.report_month_key,
                  rate: r.affected_rate as number,
                }))}
                series={[{ key: "rate", label: "Клас app", slot: 2 }]}
                kind="pct"
              />
            </Panel>
          </div>

          <Panel
            title="Помилки на реліз"
            metric="Помилки на реліз"
            note={`Останні ${RELEASE_WEEKS} тижнів вибраного періоду — блок про те, що ламається ЗАРАЗ. Рейтинг за всю історію показував би лютий 2025 на версії, якою вже ніхто не користується. Частка рахується від активних ТІЄЇ Ж версії за тиждень; версії з аудиторією менше ${MIN_VERSION_BASE} не показуємо. Фільтри ОС і версії діють лише на цей блок.`}
          >
            {releases.length === 0 ? (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                За обраний період поломок на релізах із достатньою аудиторією
                немає.
              </p>
            ) : (
              <div className="max-h-[22rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Тиждень</TableHead>
                      <TableHead>Версія</TableHead>
                      <TableHead>Помилка</TableHead>
                      <TableHead className="text-right">Людей</TableHead>
                      <TableHead className="text-right">З активних версії</TableHead>
                      <TableHead className="text-right">Разів</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releases.map((r) => (
                      <TableRow
                        key={`${r.event_week}|${r.os_type}|${r.app_version}|${r.error_kind}`}
                      >
                        <TableCell className="whitespace-nowrap">
                          {weekTooltip(r.event_week).toLowerCase()}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {r.os_type} {r.app_version}
                        </TableCell>
                        <TableCell>{r.label_ua}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n(r.affected_users)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(r.affected_rate)}{" "}
                          <span className="text-muted-foreground">
                            з {n(r.version_active_users)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {n1(r.events_per_affected)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </Section>

        {!last ? (
          <Panel title="Немає даних за обраний фільтр">
            <p className="px-1 py-6 text-sm text-muted-foreground">
              Спробуй інший період, ОС або версію.
            </p>
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label="Активних за тиждень"
                value={n(last.wau)}
                sub={weekTooltip(last.week).toLowerCase()}
                trend={
                  prevWeek
                    ? {
                        text: delta(last.wau / prevWeek.wau - 1),
                        good: last.wau >= prevWeek.wau,
                      }
                    : undefined
                }
              />
              <Kpi
                label="Примусові логаути"
                value={pct(last.logoutRate)}
                sub={`${n(last.logout)} з ${n(last.wau)}`}
                trend={
                  prevWeek?.logoutRate != null && last.logoutRate != null
                    ? {
                        text: pp(last.logoutRate - prevWeek.logoutRate),
                        good: last.logoutRate <= prevWeek.logoutRate,
                      }
                    : undefined
                }
              />
              <Kpi
                label="Технічний збій біометрії"
                value={pct(last.frictionRate)}
                sub="поп-ап не з'явився, скіпу не було"
                trend={
                  prevWeek?.frictionRate != null && last.frictionRate != null
                    ? {
                        text: pp(last.frictionRate - prevWeek.frictionRate),
                        good: last.frictionRate <= prevWeek.frictionRate,
                      }
                    : undefined
                }
              />
              <Kpi
                label="Fallback на PIN"
                value={pct(last.fallbackRate)}
                sub="поп-ап був, юзер все одно ввів PIN"
                trend={
                  prevWeek?.fallbackRate != null && last.fallbackRate != null
                    ? {
                        text: pp(last.fallbackRate - prevWeek.fallbackRate),
                        good: last.fallbackRate <= prevWeek.fallbackRate,
                      }
                    : undefined
                }
              />
            </div>

            <Section
              title="Тижневий актив і логаути"
              lead={
                <>
                  Останній тиждень ({weekTooltip(last.week).toLowerCase()}) —{" "}
                  <Hl>{n(last.wau)}</Hl> активних, з них{" "}
                  <Hl>{n(last.logout)}</Hl> примусово розлогінені (
                  <Hl>{pct(last.logoutRate)}</Hl>).
                </>
              }
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <Panel
                  title="Активних юзерів за тиждень"
                  metric="Активних за тиждень"
                  note={
                    isMixedVersions
                      ? "⚠️ Сума по версіях: юзер, що оновився впродовж тижня, порахується двічі. Для точного числа обери конкретну версію."
                      : undefined
                  }
                >
                  <BklitLine
                    xUnit="week"
                    data={withRates.map((w) => ({
                      month: w.week,
                      wau: w.wau,
                    }))}
                    series={[{ key: "wau", label: "Активні", slot: 1 }]}
                  />
                </Panel>

                <Panel title="Частка примусових логаутів" metric="Примусові логаути">
                  {/* Тижні з малою базою ВИКИДАЄМО, а не малюємо нулем:
                      `?? 0` опускав лінію в підлогу там, де частки просто
                      немає, і це читалось як «логаутів не було». */}
                  <BklitLine
                    xUnit="week"
                    data={withRates
                      .filter((w) => w.logoutRate != null)
                      .map((w) => ({
                        month: w.week,
                        rate: w.logoutRate as number,
                      }))}
                    series={[{ key: "rate", label: "Логаути", slot: 2 }]}
                    kind="pct"
                  />
                </Panel>
              </div>
            </Section>

            <Section
              title="Біометрія"
              lead={
                <>
                  Технічний збій (поп-ап не показався) торкнувся{" "}
                  <Hl>{pct(last.frictionRate)}</Hl> лояльних біо-юзерів,
                  fallback на PIN попри показаний поп-ап —{" "}
                  <Hl>{pct(last.fallbackRate)}</Hl>.
                </>
              }
            >
              <Panel
                title="Технічний збій vs fallback на PIN"
                metric={["Технічний збій біометрії", "Fallback на PIN"]}
                note="Обидва — частка від «лояльних біометричних» юзерів (бачили поп-ап біометрії за останні 30 днів)."
              >
                <BklitLine
                  xUnit="week"
                  data={withRates
                    .filter((w) => w.frictionRate != null)
                    .map((w) => ({
                      month: w.week,
                      friction: w.frictionRate as number,
                      fallback: w.fallbackRate ?? 0,
                    }))}
                  series={[
                    { key: "friction", label: "Технічний збій", slot: 1 },
                    { key: "fallback", label: "Fallback на PIN", slot: 2 },
                  ]}
                  kind="pct"
                />
              </Panel>
            </Section>
          </>
        )}
      </PageBody>
    </>
  );
}
