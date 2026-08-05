import { getActivation, getPeriod, getTimeToValue } from "@/lib/data";
import { delta, monthLabel, n, n1, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  Hl,
  Kpi,
  PageBody,
  Panel,
  PartialMonthNote,
  Section,
} from "@/components/dashboard";
import { StackedBars, TrendLines, type Series } from "@/components/trend-charts";

const FUNNEL_SERIES: Series[] = [
  { key: "activated", label: "Активовані", slot: 1 },
  { key: "passive", label: "Пасивно активовані", slot: 2 },
  { key: "none", label: "Без активності", slot: 3 },
];

export default function ActivationPage() {
  const { curKey, prevKey, partialKey, inWindow, at } = getPeriod();

  const act = getActivation();
  const actCur = at(act, curKey)!;
  const actPrev = at(act, prevKey)!;

  // Службовий рядок report_month_key = "ALL" — підсумок за весь час,
  // не місяць. У часовий ряд не потрапляє, але як орієнтир корисний.
  const ttvAll = getTimeToValue().find((r) => r.report_month_key === "ALL");
  const ttv = getTimeToValue().filter((r) => r.report_month_key !== "ALL");
  const ttvCur = at(ttv, curKey);
  const ttvPrev = at(ttv, prevKey);

  const notActivated = (r: typeof actCur) =>
    Math.max(0, r.count_new_users - r.count_activated - r.count_passively_activated);

  return (
    <>
      <PageHeader
        title="Активація"
        subtitle="Чи доходить новий користувач до цінності"
        monthKey={curKey}
      />

      <PageBody>
        {partialKey && <PartialMonthNote monthLabel={monthLabel(partialKey)} />}

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
            value={pct(actCur.activation_rate)}
            sub={`було ${pct(actPrev.activation_rate)}`}
            trend={{
              text: pp(actCur.activation_rate - actPrev.activation_rate),
              good: actCur.activation_rate >= actPrev.activation_rate,
            }}
          />
          <Kpi
            label="Медіана до цінної дії"
            value={ttvCur ? `${n1(ttvCur.median_hours_to_value)} год` : "—"}
            sub={ttvAll ? `${n1(ttvAll.median_hours_to_value)} год за весь час` : undefined}
            trend={
              ttvCur && ttvPrev && ttvPrev.median_hours_to_value > 0
                ? {
                    text: delta(
                      ttvCur.median_hours_to_value / ttvPrev.median_hours_to_value - 1
                    ),
                    // Менше — краще: напрямок «добре» інвертований.
                    good:
                      ttvCur.median_hours_to_value <= ttvPrev.median_hours_to_value,
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
              <Hl>{pct(actCur.activation_rate)}</Hl> проти{" "}
              {pct(actPrev.activation_rate)} місяцем раніше. Ще{" "}
              <Hl>{n(actCur.count_passively_activated)}</Hl> активувались
              пасивно: зайшли в додаток, але цільової дії не зробили.{" "}
              <Hl>{n(notActivated(actCur))}</Hl> не зробили нічого.
            </>
          }
        >
          <Panel
            title="Нові користувачі за станом активації"
            note="Активований — зробив цільову дію (оплата, заявка, голосування, платна послуга) у місяць першого входу."
          >
            <StackedBars
              className="aspect-[3/1] w-full"
              data={inWindow(act).map((r) => ({
                month: r.report_month_key,
                activated: r.count_activated,
                passive: r.count_passively_activated,
                none: notActivated(r),
              }))}
              series={FUNNEL_SERIES}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Конверсія в активацію"
              note="Активовані / усі нові користувачі місяця."
            >
              <TrendLines
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
              title="Години до першої цінної дії"
              note="Медіана й 90-й перцентиль. Нижче — краще."
            >
              <TrendLines
                kind="num"
                data={inWindow(ttv).map((r) => ({
                  month: r.report_month_key,
                  median: r.median_hours_to_value,
                  p90: r.p90_hours_to_value,
                }))}
                series={[
                  { key: "median", label: "Медіана, год", slot: 1 },
                  { key: "p90", label: "P90, год", slot: 2 },
                ]}
              />
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}
