import { getActivation, getPeriod, getTimeToValue } from "@/lib/data";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  Hl,
  Kpi,
  PageBody,
  Panel,
  Section,
} from "@/components/dashboard";
import type { Series } from "@/components/trend-charts";
import { BklitLine } from "@/components/bklit-line";
import { BklitBar } from "@/components/bklit-bar";
import { requireAccess } from "@/lib/guard";

// Дві категорії, не три. У марті count_activated + count_passively_activated
// == count_new_users ТОТОЖНО (перевірено: залишок = 0 у кожному місяці), тож
// "Без активності" — категорія, якої не існує: вона ніколи нічого не малювала.
// "Пасивно активовані" і Є "не зробили цільової дії".
const FUNNEL_SERIES: Series[] = [
  { key: "activated", label: "Активовані", slot: 1 },
  { key: "passive", label: "Не активувались", slot: 2 },
];

export default async function ActivationPage({ searchParams }: PageProps<"/activation">) {
  await requireAccess("/activation");
  const sp = await searchParams;
  const { curKey, prevKey, isPartial, daysElapsed, daysInMonth, bounds, range, inWindow, at, atOrZero } = getPeriod(sp);

  const act = getActivation();
  // `atOrZero`, а не `at(...)!`: першого числа місяця рядка за поточний
  // місяць у цьому марті ще немає (нових користувачів за перші години доби
  // не було), і знак оклику перетворював це на 500 — див. lib/data.ts.
  const actCur = atOrZero(act, curKey)!;
  const actPrev = atOrZero(act, prevKey)!;

  // Конверсія на порожній базі — не нуль, а відсутність виміру. Показувати
  // «0,0%» там, де ще нікого не було, означало б малювати провал, якого
  // немає (той самий принцип, що й MIN_RATE_BASE на /health).
  const actRate = (r: typeof actCur) =>
    r.count_new_users > 0 ? pct(r.activation_rate) : "—";

  // Службовий рядок report_month_key = "ALL" — підсумок за весь час,
  // не місяць. У часовий ряд не потрапляє, але як орієнтир корисний.
  const ttvAll = getTimeToValue().find((r) => r.report_month_key === "ALL");
  const ttv = getTimeToValue().filter((r) => r.report_month_key !== "ALL");
  const ttvCur = at(ttv, curKey);
  const ttvPrev = at(ttv, prevKey);

  return (
    <>
      <PageHeader
        title="Активація"
        subtitle="Чи доходить новий користувач до цінності"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Нові користувачі"
            value={n(actCur.count_new_users)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(actCur.count_new_users / actPrev.count_new_users - 1),
              good: actCur.count_new_users >= actPrev.count_new_users,
            }}
          />
          <Kpi
            label="Активовані"
            value={n(actCur.count_activated)}
            sub="цільова дія в перший місяць"
            trend={{
              text: delta(actCur.count_activated / actPrev.count_activated - 1),
              good: actCur.count_activated >= actPrev.count_activated,
            }}
          />
          <Kpi
            label="Конверсія в активацію"
            value={actRate(actCur)}
            sub={`було ${actRate(actPrev)}`}
            /* Стрілки немає, коли самої частки немає: «—» і поруч
               «−26,9 п.п.» — це два твердження, які суперечать одне одному. */
            trend={
              actCur.count_new_users > 0
                ? {
                    text: pp(actCur.activation_rate - actPrev.activation_rate),
                    good: actCur.activation_rate >= actPrev.activation_rate,
                  }
                : undefined
            }
          />
          <Kpi
            label="Дійшли до цінності за добу"
            value={ttvCur ? pct(ttvCur.rate_1d) : "—"}
            sub={ttvAll ? `${pct(ttvAll.rate_1d)} за весь час` : undefined}
            trend={
              ttvCur && ttvPrev
                ? {
                    text: pp(ttvCur.rate_1d - ttvPrev.rate_1d),
                    good: ttvCur.rate_1d >= ttvPrev.rate_1d,
                  }
                : undefined
            }
          />
        </div>

        <Section
          title="Воронка активації"
          lead={
            <>
              З <Hl>{n(actCur.count_new_users)}</Hl> нових користувачів{" "}
              {monthLabel(curKey)} цільову дію в перший же місяць зробили{" "}
              <Hl>{n(actCur.count_activated)}</Hl> —{" "}
              <Hl>{actRate(actCur)}</Hl> проти{" "}
              {actRate(actPrev)} місяцем раніше. Ще{" "}
              <Hl>{n(actCur.count_passively_activated)}</Hl> зайшли в додаток,
              але цільової дії так і не зробили.
            </>
          }
        >
          <Panel
            title="Нові користувачі за станом активації"
            metric={["Нові користувачі", "Активовані"]}
            note="Дві категорії разом дають усіх новачків місяця. Активований — зробив цільову дію (оплата, заявка, голосування, платна послуга) у місяць першого входу."
          >
            <BklitBar
              aspectRatio="3 / 1"
              data={inWindow(act).map((r) => ({
                month: r.report_month_key,
                activated: r.count_activated,
                passive: r.count_passively_activated,
              }))}
              series={FUNNEL_SERIES}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-3">
            <Panel
              title="Нові користувачі за місяць"
              metric="Нові користувачі"
              note="Скільки людей уперше зайшли в додаток. Абсолютне число під конверсією — щоб зростання відсотка на падаючому притоці не читалось як успіх."
            >
              <BklitLine
                data={inWindow(act).map((r) => ({
                  month: r.report_month_key,
                  new_users: r.count_new_users,
                }))}
                series={[{ key: "new_users", label: "Нові користувачі", slot: 1 }]}
              />
            </Panel>

            <Panel
              title="Конверсія в активацію"
              note="Активовані / усі нові користувачі місяця."
            >
              <BklitLine
                kind="pct"
                data={inWindow(act).map((r) => ({
                  month: r.report_month_key,
                  rate: r.activation_rate,
                }))}
                series={[
                  { key: "rate", label: "Конверсія в активацію", slot: 1 },
                ]}
              />
            </Panel>

            <Panel
              title="Швидкість до цінної дії"
              note="Частка нових користувачів, що зробили цінну дію за 1 годину / добу / тиждень від першого входу. Вище — краще."
            >
              <BklitLine
                kind="pct"
                data={inWindow(ttv).map((r) => ({
                  month: r.report_month_key,
                  h1: r.rate_1h,
                  d1: r.rate_1d,
                  d7: r.rate_7d,
                }))}
                series={[
                  { key: "h1", label: "За 1 годину", slot: 1 },
                  { key: "d1", label: "За добу", slot: 2 },
                  { key: "d7", label: "За тиждень", slot: 3 },
                ]}
              />
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
