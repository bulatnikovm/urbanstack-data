import { getAppHealth, getPeriod } from "@/lib/data";
import { delta, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { HealthFilters } from "@/components/health-filters";
import { BklitLine } from "@/components/bklit-line";

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

export default async function HealthPage({
  searchParams,
}: PageProps<"/health">) {
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

  const withRates = weekly.map((w) => ({
    ...w,
    logoutRate: w.wau ? w.logout / w.wau : null,
    frictionRate: w.bioTotal ? w.friction / w.bioTotal : null,
    fallbackRate: w.bioTotal ? w.fallback / w.bioTotal : null,
  }));

  const last = withRates.at(-1);
  const prevWeek = withRates.at(-2);

  const isMixedVersions = version === "all" && versions.length > 1;

  return (
    <>
      <PageHeader
        title="Стан додатку"
        subtitle="Логаути, біометрія, технічний відтік"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <HealthFilters os={os} version={version} versions={versions} />

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
                sub={`тиждень з ${last.week}`}
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
                  Останній тиждень ({last.week}) —{" "}
                  <Hl>{n(last.wau)}</Hl> активних, з них{" "}
                  <Hl>{n(last.logout)}</Hl> примусово розлогінені (
                  <Hl>{pct(last.logoutRate)}</Hl>).
                </>
              }
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <Panel
                  title="Активних юзерів за тиждень"
                  note={
                    isMixedVersions
                      ? "⚠️ Сума по версіях: юзер, що оновився впродовж тижня, порахується двічі. Для точного числа обери конкретну версію."
                      : undefined
                  }
                >
                  <BklitLine
                    data={withRates.map((w) => ({
                      month: w.week,
                      wau: w.wau,
                    }))}
                    series={[{ key: "wau", label: "Активні", slot: 1 }]}
                  />
                </Panel>

                <Panel title="Частка примусових логаутів">
                  <BklitLine
                    data={withRates.map((w) => ({
                      month: w.week,
                      rate: w.logoutRate ?? 0,
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
                note="Обидва — частка від «лояльних біометричних» юзерів (бачили поп-ап біометрії за останні 30 днів)."
              >
                <BklitLine
                  data={withRates.map((w) => ({
                    month: w.week,
                    friction: w.frictionRate ?? 0,
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
