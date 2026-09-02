import {
  getSlaPeriod,
  getStatusTotals,
  sliceActive,
  type SliceSel,
  type SlaMonthly,
} from "@/lib/data-operational";
import { delta, monthLabel, n, pct, pp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Hl, Kpi, PageBody, Panel, Section } from "@/components/dashboard";
import { BklitBar } from "@/components/bklit-bar";
import { BklitDonut } from "@/components/bklit-donut";
import { BklitLine } from "@/components/bklit-line";
import { SliceFilters } from "@/components/slice-filters";
import { ExportXlsx } from "@/components/export-xlsx";
import {
  CellBreakdown,
  CellBreakdownProvider,
  type Breakdown,
} from "@/components/cell-breakdown";
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
 * Сторінка повторює структуру Стор. 2 старого звіту Looker («Операційна
 * ефективність (SLA)») — у ТОМУ САМОМУ порядку і з тими самими підписами.
 *
 * Це не консерватизм заради консерватизму: операційний відділ користується
 * цими блоками щодня, і коли в новому дашборді «Відхилені заявки» стали
 * «Скасовано», а зведена таблиця по місяцях зникла зовсім, онбординг у нове
 * середовище перетворився на переклад з мови на мову (претензія Максима,
 * 2026-08-26). Порядок блоків знизу вгору: фільтри → зведена по місяцях →
 * потік → ефективність за місяць по ЖК → місяць-у-місяць по ЖК → роки.
 * Наші власні додатки («Статуси за весь час») ідуть ПІСЛЯ, а не замість.
 */

const rate = (part: number, total: number) => (total > 0 ? part / total : 0);

/**
 * Скільки місяців показувати в зведених таблицях.
 *
 * Стільки ж, скільки показував Looker («1 - 13 / 13»). Обмеження не
 * косметичне: у зведеній по ЖК кожен місяць — це 4-5 колонок, і на повному
 * періоді (68 місяців від запуску CRM) таблиця стає в 300 колонок завширшки.
 * Дейт-пікер зверху лишається головним способом обрати період; тут
 * показуємо його ХВІСТ — найсвіжіші місяці.
 */
const PIVOT_MONTHS = 13;

/**
 * Укрупнення сирого статусу заявки в три групи, які показував старий пончик.
 * Пʼять сирих значень (completed / canceled / in_progress / consideration /
 * new) для читача нічого не додають: «розгляд» і «нова» — та сама відповідь
 * «ще в роботі».
 */
const STATUS_GROUP: Record<string, string> = {
  completed: "Виконано",
  canceled: "Відхилено",
  cancelled: "Відхилено",
  rejected: "Відхилено",
};
const statusGroup = (s: string) => STATUS_GROUP[s] ?? "В процесі";

/**
 * Ідентифікатор синтетичного рядка «Загальний підсумок».
 *
 * Зірочка, а не порожній рядок чи `null`: з нею ключ у мапах лишається
 * рядком, а сам ідентифікатор неможливо сплутати з UUID справжнього ЖК.
 */
const TOTAL_ID = "*";

type ComplexPivotRow = {
  complex_id: string;
  complex_name: string;
  byMonth: Map<string, SlaMonthly>;
  total: number;
};

export default async function SlaPage({ searchParams }: PageProps<"/operations/sla">) {
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
    raw,
    filters,
    isSliced,
    slices,
    byComplex,
    complexMonths,
    categorySlice,
  } = getSlaPeriod(sp);

  // ── Зведена по місяцях (метрики в рядках, місяці в колонках) ──────────
  const monthsDesc = [...base].reverse().slice(0, PIVOT_MONTHS);

  /**
   * Рядок зведеної рахується з НАБОРУ місяців, а не з одного рядка — і саме
   * тому підсумкова колонка «Разом» рахується правильно.
   *
   * Прохання Миколи (2026-08-31): «загальні відсотки виконання, розраховані
   * від абсолюту, як це було в попередньому продукті». У Looker праворуч від
   * місяців стояла колонка підсумку, і відсоток у ній — це СУМА виконаних
   * поділена на СУМУ створених за весь період, а не середнє з місячних
   * відсотків. Різниця не косметична: середнє з відсотків дає однакову вагу
   * місяцю з трьомастами заявками й місяцю з десятьма тисячами.
   *
   * Оскільки формула однакова для однієї клітинки й для підсумку, тут
   * фізично неможливо порахувати їх по-різному.
   */
  type SlaRow = (typeof base)[number];
  const sum = (rows: SlaRow[], pick: (r: SlaRow) => number) =>
    rows.reduce((acc, r) => acc + pick(r), 0);

  const SUMMARY_ROWS: Array<{
    label: string;
    value: (rows: SlaRow[]) => string;
    accent?: boolean;
    /** «В процесі» — це СТАН на кінець місяця, а не подія; підсумовувати
     *  його по місяцях не можна (вийшла б сума залишків). У колонці
     *  «Разом» показуємо залишок останнього місяця періоду. */
    totalMode?: "last";
  }> = [
    { label: "Створено заявок", value: (rs) => n(sum(rs, (r) => r.created_count)) },
    {
      label: "Виконано (загалом)",
      value: (rs) => n(sum(rs, (r) => r.completed_count)),
    },
    {
      label: "Виконано (Міс. / Міс.)",
      value: (rs) => n(sum(rs, (r) => r.completed_same_month_count)),
    },
    {
      label: "Відхилені заявки",
      value: (rs) => n(sum(rs, (r) => r.canceled_count)),
    },
    {
      label: "% Відхилених",
      value: (rs) =>
        pct(rate(sum(rs, (r) => r.canceled_count), sum(rs, (r) => r.created_count))),
      accent: true,
    },
    {
      label: "% Виконання (загалом)",
      value: (rs) =>
        pct(rate(sum(rs, (r) => r.completed_count), sum(rs, (r) => r.created_count))),
      accent: true,
    },
    {
      label: "% Виконання (Міс. в Міс.)",
      value: (rs) =>
        pct(
          rate(
            sum(rs, (r) => r.completed_same_month_count),
            sum(rs, (r) => r.created_count)
          )
        ),
      accent: true,
    },
    {
      label: "В процесі",
      value: (rs) => n(rs.length ? rs[rs.length - 1].backlog_end_of_month : 0),
      totalMode: "last",
    },
  ];

  /** Місяці підсумку — за зростанням, щоб «останній» справді був останнім. */
  const totalRows = [...monthsDesc].reverse();

  // ── Зведені по ЖК ─────────────────────────────────────────────────────
  const pivotMonthKeys = monthsDesc.map((m) => m.report_month_key);
  const complexRows: ComplexPivotRow[] = [];
  {
    const acc = new Map<string, ComplexPivotRow>();
    for (const r of complexMonths()) {
      if (!pivotMonthKeys.includes(r.report_month_key)) continue;
      const row =
        acc.get(r.complex_id) ??
        ({
          complex_id: r.complex_id,
          complex_name: r.complex_name,
          byMonth: new Map(),
          total: 0,
        } satisfies ComplexPivotRow);
      row.byMonth.set(r.report_month_key, r);
      row.total += r.created_count;
      acc.set(r.complex_id, row);
    }
    complexRows.push(
      ...[...acc.values()]
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total)
    );
  }

  // ── Розклад клітинки по категоріях (ANA-20) ───────────────────────────
  //
  // Максим: «при наведенні курсору на ЖК — розширена інформація по заявках,
  // місяць в місяць, зріз по категоріях, по абс. значеннях і відсотках».
  //
  // Рахуємо з `categorySlice()` — того самого набору рядків, з якого
  // побудована вся сторінка, тільки без згортання категорії. Тому сума по
  // категоріях у картці ЗАВЖДИ дорівнює числу в клітинці, під якою вона
  // висить, і фільтри діють на неї так само.
  const prevMonthKey = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    // Через UTC-дату, а не «m − 1»: у січні це дає грудень попереднього року
    // без окремої гілки, і нуль місяця тут неможливий за побудовою.
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  /** `${complex_id}|${month}` → категорія → створено. */
  const catCounts = new Map<string, Map<string, number>>();
  {
    // Разом із попередніми місяцями: зведена показує ХВІСТ періоду (13
    // місяців), а порівняння тягнеться на місяць глибше — той місяць у
    // періоді є, просто в таблиці його не видно.
    const wanted = new Set(pivotMonthKeys.flatMap((m) => [m, prevMonthKey(m)]));
    for (const r of categorySlice()) {
      if (!wanted.has(r.report_month_key)) continue;
      if (r.created_count === 0) continue;
      // Поруч із ключем ЖК одразу накопичуємо компанійський — його читає
      // рядок «Загальний підсумок». Окремий прохід по тих самих рядках дав
      // би другу нагоду порахувати інакше.
      for (const cid of [r.complex_id, TOTAL_ID]) {
        const key = `${cid}|${r.report_month_key}`;
        const acc = catCounts.get(key) ?? new Map<string, number>();
        acc.set(r.category_ua, (acc.get(r.category_ua) ?? 0) + r.created_count);
        catCounts.set(key, acc);
      }
    }
  }

  const breakdownOf = (
    row: ComplexPivotRow,
    monthKey: string
  ): Breakdown | null => {
    const cur = catCounts.get(`${row.complex_id}|${monthKey}`);
    const prevKeyRaw = prevMonthKey(monthKey);
    const prev = catCounts.get(`${row.complex_id}|${prevKeyRaw}`);
    if (!cur && !prev) return null;

    const sumOf = (m?: Map<string, number>) =>
      m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;

    // Попередній місяць вважається відомим лише тоді, коли він у ПЕРІОДІ:
    // за його межами `categorySlice` рядків не віддає, і нуль там означав би
    // «даних немає», а не «заявок не було». Тому в найстарішого місяця
    // вибраного періоду колонки «Δ м/м» немає — і це чесно.
    const hasPrev = prevKeyRaw >= range.from && prevKeyRaw <= range.to;

    const labels = new Set([...(cur?.keys() ?? []), ...(prev?.keys() ?? [])]);
    return {
      complexName: row.complex_name,
      monthKey,
      prevMonthKey: hasPrev ? prevKeyRaw : null,
      total: sumOf(cur),
      prevTotal: sumOf(prev),
      rows: [...labels]
        .map((label) => ({
          label,
          cur: cur?.get(label) ?? 0,
          prev: prev?.get(label) ?? 0,
        }))
        .sort((a, b) => b.cur - a.cur || b.prev - a.prev),
    };
  };

  // ── Роки ──────────────────────────────────────────────────────────────
  // Рахуються з того самого `raw`, що й усе інше на сторінці, а не з
  // окремого річного вивантаження: тільки так рік реагує на фільтр.
  // Розбіжності з mart_yearly_totals бути не може — той теж сума місяців.
  type YearRow = {
    year: number;
    created: number;
    completed: number;
    canceled: number;
  };
  const yearsByComplex = new Map<string, Map<number, YearRow>>();
  const yearTotals = new Map<number, YearRow>();
  for (const r of raw) {
    const year = Number(r.report_month_key.slice(0, 4));
    const bump = (t: YearRow) => {
      t.created += r.created_count;
      t.completed += r.completed_count;
      t.canceled += r.canceled_count;
    };
    const perComplex =
      yearsByComplex.get(r.complex_id) ?? new Map<number, YearRow>();
    const cell =
      perComplex.get(year) ??
      ({ year, created: 0, completed: 0, canceled: 0 } satisfies YearRow);
    bump(cell);
    perComplex.set(year, cell);
    yearsByComplex.set(r.complex_id, perComplex);

    const tot =
      yearTotals.get(year) ??
      ({ year, created: 0, completed: 0, canceled: 0 } satisfies YearRow);
    bump(tot);
    yearTotals.set(year, tot);
  }
  // Роки без жодної заявки відкидаємо: календарний спайн mart'а починається
  // з 2021, а перша заявка в CRM — квітень 2022, і порожній рядок «2021 · 0 ·
  // 0 · 0,0%» читається як втрачені дані, а не як «системи тоді не було».
  const years = [...yearTotals.values()]
    .filter((y) => y.created > 0)
    .sort((a, b) => a.year - b.year);

  const complexYearRows = [...yearsByComplex.entries()]
    .map(([complex_id, byYear]) => {
      const name =
        raw.find((r) => r.complex_id === complex_id)?.complex_name ?? "—";
      const rows = [...byYear.values()]
        .filter((y) => y.created > 0)
        .sort((a, b) => b.year - a.year);
      return {
        complex_id,
        complex_name: name,
        rows,
        total: rows.reduce((a, y) => a + y.created, 0),
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);


  /**
   * Рядки «Загальний підсумок» для ВИГРУЗОК зведених по ЖК — по одному на
   * місяць.
   *
   * На екрані такий підсумок уже є (ANA-9), а у вигрузці його не було: людина
   * відкривала Excel і сумувала руками те, що на екрані вже пораховано
   * (ANA-8, перевірено на файлах dim9000-sla-mom / -complex від 02.09 —
   * 183 рядки й жодного підсумку).
   *
   * Форма вигрузки «довга» (рядок = місяць × ЖК), тому підсумок тут — це не
   * колонка, як на екрані, а СИНТЕТИЧНИЙ ЖК. І стоїть він ПІД блоком свого
   * місяця, а не купою на початку файлу.
   *
   * Перша версія складала всі підсумки вгорі — Микита одразу сказав, що це
   * «незручно й дивно виглядає», і мав рацію: підсумок відірваний від того,
   * що підсумовує, а на екрані він стоїть ОСТАННІМ рядком, після всіх ЖК.
   * Тепер файл читається так само, як таблиця: блок місяця — і одразу під
   * ним його підсумок.
   *
   * Порядок місяців не чіпаємо — він такий, яким приходить з марту (від
   * старих до нових), і люди до нього звикли.
   *
   * Підсумки проходять через ті самі колонки-аксесори, що й звичайні рядки,
   * тож відсоток у них неминуче рахується від абсолютів (сума виконаних /
   * сума створених), а не як середнє з відсотків по ЖК.
   *
   * ⚠️ «В процесі» тут ПІДСУМОВУЄТЬСЯ, і саме по ЖК це коректно: черги
   * різних ЖК не перетинаються, тож їхня сума і є черга компанії. По
   * МІСЯЦЯХ той самий стовпчик складати не можна — вийшла б сума залишків.
   */
  const withComplexTotals = (rows: SlaMonthly[]): SlaMonthly[] => {
    const order: string[] = [];
    const byMonth = new Map<string, { rows: SlaMonthly[]; total: SlaMonthly }>();

    for (const r of rows) {
      let block = byMonth.get(r.report_month_key);
      if (!block) {
        order.push(r.report_month_key);
        block = {
          rows: [],
          total: {
            report_month_key: r.report_month_key,
            complex_id: TOTAL_ID,
            complex_name: "Загальний підсумок",
            created_count: 0,
            completed_count: 0,
            canceled_count: 0,
            completed_same_month_count: 0,
            backlog_end_of_month: 0,
          },
        };
        byMonth.set(r.report_month_key, block);
      }
      block.rows.push(r);
      block.total.created_count += r.created_count;
      block.total.completed_count += r.completed_count;
      block.total.canceled_count += r.canceled_count;
      block.total.completed_same_month_count += r.completed_same_month_count;
      block.total.backlog_end_of_month += r.backlog_end_of_month;
    }

    return order.flatMap((m) => {
      const block = byMonth.get(m)!;
      return [...block.rows, block.total];
    });
  };

  // ── Наші додатки ──────────────────────────────────────────────────────
  const curSameMonth = rate(cur.completed_same_month_count, cur.created_count);
  const prevSameMonth = rate(prev.completed_same_month_count, prev.created_count);
  const curCancel = rate(cur.canceled_count, cur.created_count);
  const prevCancel = rate(prev.canceled_count, prev.created_count);

  // Пончик статусів — за весь час, без розрізу місяця (як у старому звіті).
  // Фільтри на нього не діють: `agg_status_totals` не має ні категорії, ні
  // тега в грануляції, і мовчки показувати нефільтровану цифру поруч із
  // фільтрованими було б гірше, ніж прибрати блок.
  const statusRows = getStatusTotals();
  const byStatus = new Map<string, number>();
  for (const r of statusRows) {
    const g = statusGroup(r.status);
    byStatus.set(g, (byStatus.get(g) ?? 0) + r.order_count);
  }
  const donut = [...byStatus.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const allTime = donut.reduce((a, d) => a + d.value, 0);

  const complexesCur = byComplex(curKey).sort(
    (a, b) => b.created_count - a.created_count
  );

  /**
   * Підсумок цієї ж таблиці (ANA-9). Складаємо лічильники, а «Міс. в міс.»
   * рахуємо вже з них — сума виконаних поділена на суму створених, а не
   * середнє з відсотків по ЖК: інакше ЖК із чотирнадцятьма заявками важив
   * би стільки ж, скільки ЖК із шістьмастами.
   */
  const curTotals = complexesCur.reduce(
    (acc, c) => ({
      created_count: acc.created_count + c.created_count,
      completed_count: acc.completed_count + c.completed_count,
      completed_same_month_count:
        acc.completed_same_month_count + c.completed_same_month_count,
      backlog_end_of_month: acc.backlog_end_of_month + c.backlog_end_of_month,
    }),
    {
      created_count: 0,
      completed_count: 0,
      completed_same_month_count: 0,
      backlog_end_of_month: 0,
    }
  );

  /**
   * Опис зрізу словами. Напрям пишемо явно: «крім» і «саме ці» — це
   * протилежні цифри під тим самим списком значень, і з посилання, яке
   * комусь переслали, має бути видно, який із двох станів на екрані.
   *
   * Форми слова передаємо руками (називний однина/множина, родовий
   * однина/множина): «крім категорія» — це той рівень недбалості, після
   * якого решті тексту на сторінці теж не вірять.
   */
  const selLabel = (
    sel: SliceSel,
    forms: { one: string; many: string; ofOne: string; ofMany: string }
  ) => {
    if (sel.values.length === 0) return null;
    const list = sel.values.map((v) => `«${v}»`).join(", ");
    const single = sel.values.length === 1;
    return sel.mode === "ex"
      ? `крім ${single ? forms.ofOne : forms.ofMany} ${list}`
      : `${single ? forms.one : forms.many} ${list}`;
  };
  const sliceLabel = [
    selLabel(filters.category, {
      one: "категорія",
      many: "категорії",
      ofOne: "категорії",
      ofMany: "категорій",
    }),
    selLabel(filters.type, {
      one: "тип",
      many: "типи",
      ofOne: "типу",
      ofMany: "типів",
    }),
    selLabel(filters.tag, {
      one: "тег",
      many: "теги",
      ofOne: "тега",
      ofMany: "тегів",
    }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title="Операційна ефективність (SLA)"
        subtitle="Скільки заявок подають, скільки закриваємо і що лишається в процесі"
        monthKey={curKey}
        partial={isPartial ? { daysElapsed, daysInMonth } : undefined}
        range={range}
        bounds={bounds}
      />

      <PageBody>
        <SliceFilters
          categories={slices.categories}
          types={slices.types}
          tags={slices.tags}
          active={filters}
        />

        {isSliced && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Показано зріз: <Hl>{sliceLabel}</Hl>. Під фільтром «В процесі» —
            це наростаючий залишок САМЕ цього зрізу (скільки з поданих ще не
            закрито), а не черга ЖК цілком: стан черги розрізати по категорії
            чи тегу неможливо. Пончик статусів унизу фільтр не враховує.
            {sliceActive(filters.tag) && (
              <>
                {" "}
                Фільтр по тегу діє на ЗАЯВКУ, а не на мітку:{" "}
                <Hl>«крім»</Hl> прибирає заявку, якщо на ній є вказаний тег,
                хоч би скільки в неї було інших. Обрано кілька тегів у режимі
                «Показати» — потрапляють заявки, де є <Hl>всі</Hl> обрані
                (зайві теги не заважають). Заявки без жодної мітки — це окреме
                значення «Без тега», а не порожнеча. Лічильники в дропдауні
                рахуються по кожному тегу окремо, тому їхня сума більша за
                кількість заявок.
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Створено заявок"
            value={n(cur.created_count)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(cur.created_count / Math.max(prev.created_count, 1) - 1),
              // Зростання потоку заявок — не «добре»: більше звернень означає
              // більше проблем у будинках, а не кращу роботу.
              good: null,
            }}
          />
          <Kpi
            label="Виконано (загалом)"
            value={n(cur.completed_count)}
            sub={`до ${monthLabel(prevKey)}`}
            trend={{
              text: delta(
                cur.completed_count / Math.max(prev.completed_count, 1) - 1
              ),
              good: cur.completed_count >= prev.completed_count,
            }}
          />
          <Kpi
            label="% Виконання (Міс. в Міс.)"
            value={pct(curSameMonth)}
            sub={`${n(cur.completed_same_month_count)} заявок`}
            trend={{
              text: pp(curSameMonth - prevSameMonth),
              good: curSameMonth >= prevSameMonth,
            }}
          />
          <Kpi
            label="% Відхилених"
            value={pct(curCancel)}
            sub={`${n(cur.canceled_count)} заявок`}
            trend={{
              text: pp(curCancel - prevCancel),
              good: curCancel <= prevCancel,
            }}
          />
        </div>

        <Section
          title="Місяць в місяць"
          lead={
            <>
              Зведена по компанії: усі сім показників старого звіту в одній
              таблиці, найсвіжіший місяць ліворуч. «Виконано (загалом)» — усе,
              що закрили цього місяця, незалежно від того, коли подали; тому
              воно буває більшим за «Створено», і «% Виконання (загалом)»
              заходить за 100%. «Міс. / Міс.» рахує тільки те, що подали й
              закрили в одному місяці — ця цифра за побудовою не перевищує
              100%.
            </>
          }
        >
          <Panel
            title="Зведена по місяцях"
            note={`Показано ${monthsDesc.length} останніх місяців вибраного періоду. «Разом» — за ці ${monthsDesc.length} місяців; відсотки в ньому рахуються від абсолюту (сума виконаних на суму створених), а не як середнє з місячних. У вигрузці підсумок за ВЕСЬ вибраний період. Групова заявка рахується один раз — батьківською, дочірні не рахуються.`}
            metric="Зведена по місяцях"
            action={
              <ExportXlsx
                fileName={`dim9000-sla-monthly-${curKey}`}
                sheetName="Місяць в місяць"
                sheet={buildSheet(
                  [
                    ...[...base].reverse(),
                    // Рядок підсумку — В КІНЦІ, після місяців, які він
                    // підсумовує. Спершу він стояв першим, і Микита слушно
                    // зауважив, що підсумки вгорі файлу «незручно й дивно
                    // виглядають»: на екрані підсумок теж іде після даних.
                    //
                    // Відсоткові колонки нижче рахуються з полів рядка, тому
                    // в підсумку вони самі виходять «від абсолюту»: сума
                    // виконаних на суму створених, а не середнє з місячних
                    // відсотків.
                    //
                    // Порожній період (жодного місяця в зрізі) підсумку не
                    // отримує: рядок «Разом: 0 з 0» — це не інформація.
                    ...(base.length
                      ? [
                          {
                            ...base[base.length - 1],
                            report_month_key: "Разом",
                            created_count: sum(base, (r) => r.created_count),
                            completed_count: sum(base, (r) => r.completed_count),
                            completed_same_month_count: sum(
                              base,
                              (r) => r.completed_same_month_count
                            ),
                            canceled_count: sum(base, (r) => r.canceled_count),
                          },
                        ]
                      : []),
                  ],
                  [
                  { header: "Місяць", value: (r) => r.report_month_key, width: 10 },
                  { header: "Створено заявок", value: (r) => r.created_count },
                  { header: "Виконано (загалом)", value: (r) => r.completed_count },
                  {
                    header: "Виконано (Міс. / Міс.)",
                    value: (r) => r.completed_same_month_count,
                  },
                  { header: "Відхилені заявки", value: (r) => r.canceled_count },
                  {
                    header: "% Відхилених",
                    value: (r) => rate(r.canceled_count, r.created_count),
                    format: "0.0%",
                  },
                  {
                    header: "% Виконання (загалом)",
                    value: (r) => rate(r.completed_count, r.created_count),
                    format: "0.0%",
                  },
                  {
                    header: "% Виконання (Міс. в Міс.)",
                    value: (r) =>
                      rate(r.completed_same_month_count, r.created_count),
                    format: "0.0%",
                  },
                  { header: "В процесі", value: (r) => r.backlog_end_of_month },
                ])}
              />
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">
                      Місяць
                    </TableHead>
                    <TableHead className="text-right font-semibold whitespace-nowrap">
                      Разом
                    </TableHead>
                    {monthsDesc.map((m) => (
                      <TableHead
                        key={m.report_month_key}
                        className="text-right whitespace-nowrap"
                      >
                        {monthLabel(m.report_month_key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SUMMARY_ROWS.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="sticky left-0 z-10 bg-card font-medium whitespace-nowrap">
                        {row.label}
                      </TableCell>
                      {/* Підсумок стоїть ПЕРЕД місяцями, одразу біля назви
                          показника: місяців тринадцять, і в кінці рядка
                          його довелось би шукати прокруткою. */}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.value(totalRows)}
                      </TableCell>
                      {monthsDesc.map((m) => (
                        <TableCell
                          key={m.report_month_key}
                          className={
                            row.accent
                              ? "text-right tabular-nums text-muted-foreground"
                              : "text-right tabular-nums"
                          }
                        >
                          {row.value([m])}
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
          title="Потік і швидкість"
          lead={
            <>
              У {monthLabel(curKey)} подали <Hl>{n(cur.created_count)}</Hl>{" "}
              заявок, закрили <Hl>{n(cur.completed_count)}</Hl>, відхилили{" "}
              <Hl>{n(cur.canceled_count)}</Hl>. У процесі на кінець місяця —{" "}
              <Hl>{n(cur.backlog_end_of_month)}</Hl>.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title="Створено · Виконано · Відхилено"
              note="Створено — за датою подачі, виконано й відхилено — за датою закриття. Тому стовпчики одного місяця описують різні заявки: це два різні моменти життя заявки, а не один."
              metric={["Створено заявок", "Виконано (загалом)"]}
            >
              <BklitBar
                aspectRatio="2 / 1"
                data={base.map((r) => ({
                  month: r.report_month_key,
                  created: r.created_count,
                  completed: r.completed_count,
                  canceled: r.canceled_count,
                }))}
                series={[
                  { key: "created", label: "Створено заявок", slot: 1 },
                  { key: "completed", label: "Виконано заявок", slot: 2 },
                  { key: "canceled", label: "Відхилено заявок", slot: 3 },
                ]}
              />
            </Panel>

            {/*
              `fill` + `contentClassName="flex-1"` — щоб лінія зайняла всю
              висоту картки. Сусідня панель ширша (3fr проти 2fr), у грід-ряду
              картки однакової висоти, і графік із пропорцією 2/1 закінчувався
              на третину раніше за неї — під лінією зяяла порожнеча.
            */}
            <Panel
              title="В процесі"
              note="Наростаючий незакритий залишок на кінець місяця: усе подане мінус усе закрите й відхилене."
              metric="В процесі"
              contentClassName="flex min-h-0 flex-1 flex-col"
            >
              <BklitLine
                fill
                data={base.map((r) => ({
                  month: r.report_month_key,
                  backlog: r.backlog_end_of_month,
                }))}
                series={[{ key: "backlog", label: "В процесі", slot: 1 }]}
              />
            </Panel>
          </div>

          <Panel
            title="% Виконання"
            note="«Міс. в Міс.» за побудовою не перевищує 100%. «Загалом» — може, і саме це показує роботу з накопиченою чергою."
            metric="% Виконання (загалом)"
          >
            <BklitLine
              aspectRatio="3 / 1"
              kind="pct"
              data={base.map((r) => ({
                month: r.report_month_key,
                same: rate(r.completed_same_month_count, r.created_count),
                total: rate(r.completed_count, r.created_count),
                cancel: rate(r.canceled_count, r.created_count),
              }))}
              series={[
                { key: "total", label: "% Виконання (загалом)", slot: 1 },
                { key: "same", label: "% Виконання (Міс. в Міс.)", slot: 2 },
                { key: "cancel", label: "% Відхилених", slot: 3 },
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Операційна ефективність за місяць"
          lead={
            <>
              Той самий розріз, що й у старому звіті: ЖК у рядках, місяці в
              колонках. «Виконано» тут — усе закрите протягом місяця,
              «В процесі» — накопичений залишок ЖК на його кінець, а не
              заявки цього місяця.
            </>
          }
        >
          <Panel
            title="Операційна ефективність за місяць"
            note={`${complexRows.length} ЖК × ${pivotMonthKeys.length} місяців. Прокручується вбік. Наведи на назву ЖК або на «Всього» — покаже розклад по категоріях.`}
            action={
              <ExportXlsx
                fileName={`dim9000-sla-complex-${curKey}`}
                sheetName="Зведена"
                sheet={buildSheet(withComplexTotals(complexMonths()), [
                  { header: "Місяць", value: (r) => r.report_month_key, width: 10 },
                  { header: "ЖК", value: (r) => r.complex_name, width: 26 },
                  { header: "Всього заявок", value: (r) => r.created_count },
                  { header: "Виконано заявок", value: (r) => r.completed_count },
                  {
                    header: "% Виконання загалом",
                    value: (r) => rate(r.completed_count, r.created_count),
                    format: "0.0%",
                  },
                  { header: "В процесі", value: (r) => r.backlog_end_of_month },
                ])}
              />
            }
          >
            <ComplexPivot
              months={pivotMonthKeys}
              rows={complexRows}
              breakdown={breakdownOf}
              columns={[
                { header: "Всього", value: (r) => n(r.created_count) },
                { header: "Виконано", value: (r) => n(r.completed_count) },
                {
                  header: "% Викон.",
                  value: (r) => pct(rate(r.completed_count, r.created_count), 0),
                  muted: true,
                },
                { header: "В процесі", value: (r) => n(r.backlog_end_of_month) },
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Місяць в місяць по ЖК"
          lead={
            <>
              Той самий набір ЖК, але рахуються ЛИШЕ заявки, подані й закриті
              в одному місяці. Це відповідь на питання «скільки встигаємо по
              гарячому», без впливу розібраної старої черги.
            </>
          }
        >
          <Panel
            title="Місяць в місяць по ЖК"
            note="«Виконано» і «Відхилено» тут — з числа поданих у ТОМУ Ж місяці, тому відсотки не перевищують 100%. Наведи на назву ЖК або на «Всього» — покаже розклад по категоріях."
            action={
              <ExportXlsx
                fileName={`dim9000-sla-mom-${curKey}`}
                sheetName="Зведена"
                sheet={buildSheet(withComplexTotals(complexMonths()), [
                  { header: "Місяць", value: (r) => r.report_month_key, width: 10 },
                  { header: "ЖК", value: (r) => r.complex_name, width: 26 },
                  { header: "Всього заявок", value: (r) => r.created_count },
                  {
                    header: "Виконано місяць в місяць",
                    value: (r) => r.completed_same_month_count,
                  },
                  {
                    header: "% Виконання (міс. в міс.)",
                    value: (r) =>
                      rate(r.completed_same_month_count, r.created_count),
                    format: "0.0%",
                  },
                  { header: "Відхилено", value: (r) => r.canceled_count },
                  {
                    header: "% Відхилених",
                    value: (r) => rate(r.canceled_count, r.created_count),
                    format: "0.0%",
                  },
                ])}
              />
            }
          >
            <ComplexPivot
              months={pivotMonthKeys}
              rows={complexRows}
              breakdown={breakdownOf}
              columns={[
                { header: "Всього", value: (r) => n(r.created_count) },
                {
                  header: "Викон. м/м",
                  value: (r) => n(r.completed_same_month_count),
                },
                {
                  header: "% м/м",
                  value: (r) =>
                    pct(rate(r.completed_same_month_count, r.created_count), 0),
                  muted: true,
                },
                { header: "Відхилено", value: (r) => n(r.canceled_count) },
                {
                  header: "% Відх.",
                  value: (r) => pct(rate(r.canceled_count, r.created_count), 0),
                  muted: true,
                },
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Заявки по роках"
          lead={
            <>
              Рік фіксується датою ПОДАЧІ заявки. У старому звіті рік брався
              за датою закриття, і грудневі заявки, закриті в січні,
              переїжджали в наступний рік — «створено за рік» переставало бути
              кількістю створеного. «В процесі» тут теж не поточна черга: це
              скільки з поданих того року не закрили того ж року.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
            <Panel
              title="По роках — графік"
              note="Рік подачі, усі ЖК разом. Обидва блоки цієї секції показують ВСЮ історію незалежно від дейт-пікера (як і в старому звіті) — але фільтри Категорія/Тип/Тег на них діють."
              metric="Заявки по роках"
            >
              <BklitBar
                aspectRatio="3 / 2"
                xKey="year"
                data={years.map((y) => ({
                  year: String(y.year),
                  created: y.created,
                  completed: y.completed,
                  canceled: y.canceled,
                }))}
                series={[
                  { key: "created", label: "Створено", slot: 1 },
                  { key: "completed", label: "Виконано", slot: 2 },
                  { key: "canceled", label: "Відхилено", slot: 3 },
                ]}
              />
            </Panel>

            <Panel
              title="ЖК × рік створення"
              metric="Заявки по роках"
              action={
                <ExportXlsx
                  fileName={`dim9000-sla-years-${curKey}`}
                  sheetName="ЖК × рік"
                  sheet={buildSheet(
                    [
                      ...complexYearRows.flatMap((c) =>
                        c.rows.map((y) => ({ complex: c.complex_name, ...y }))
                      ),
                      /*
                        Рядок «Загальний підсумок» — В КІНЦІ, там само, де
                        він стоїть у таблиці на екрані (ANA-8). Раніше він
                        жив тільки на екрані, потім поїхав у файл першим
                        рядком — і це виявилось незручним: підсумок
                        відірваний від того, що підсумовує.
                        Відсоток рахується від абсолюту: сума виконаних на
                        суму створених, а не середнє з річних відсотків.
                      */
                      ...(years.length
                        ? [
                            {
                              complex: "Загальний підсумок",
                              // Порожній рік: `buildSheet` перетворює це на
                              // порожню клітинку, а не на нуль чи «0».
                              year: "",
                              created: years.reduce((a, y) => a + y.created, 0),
                              completed: years.reduce(
                                (a, y) => a + y.completed,
                                0
                              ),
                              canceled: years.reduce(
                                (a, y) => a + y.canceled,
                                0
                              ),
                            },
                          ]
                        : []),
                    ],
                    [
                      { header: "ЖК", value: (r) => r.complex, width: 26 },
                      { header: "Рік створення", value: (r) => r.year },
                      { header: "Створено", value: (r) => r.created },
                      { header: "Виконано", value: (r) => r.completed },
                      { header: "Відхилено", value: (r) => r.canceled },
                      {
                        header: "В процесі",
                        value: (r) => r.created - r.completed - r.canceled,
                      },
                      {
                        header: "% виконання",
                        value: (r) => rate(r.completed, r.created),
                        format: "0.0%",
                      },
                    ]
                  )}
                />
              }
            >
              <div className="max-h-[520px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ЖК</TableHead>
                      <TableHead className="text-right">Рік</TableHead>
                      <TableHead className="text-right">Створено</TableHead>
                      <TableHead className="text-right">Виконано</TableHead>
                      <TableHead className="text-right">Відхилено</TableHead>
                      <TableHead className="text-right">В процесі</TableHead>
                      <TableHead className="text-right">% викон.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complexYearRows.map((c) =>
                      c.rows.map((y, i) => (
                        <TableRow key={`${c.complex_id}-${y.year}`}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {i === 0 ? c.complex_name : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {y.year}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {n(y.created)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {n(y.completed)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {n(y.canceled)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {n(y.created - y.completed - y.canceled)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {pct(rate(y.completed, y.created), 0)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow className="font-semibold">
                      <TableCell>Загальний підсумок</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">
                        {n(years.reduce((a, y) => a + y.created, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(years.reduce((a, y) => a + y.completed, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(years.reduce((a, y) => a + y.canceled, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(
                          years.reduce(
                            (a, y) => a + y.created - y.completed - y.canceled,
                            0
                          )
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(
                          rate(
                            years.reduce((a, y) => a + y.completed, 0),
                            years.reduce((a, y) => a + y.created, 0)
                          ),
                          0
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </div>
        </Section>

        <Section
          title="Додатково"
          lead={
            <>
              Блоки, яких у старому звіті не було. Порівняння ЖК за
              {" "}{monthLabel(curKey)} і розподіл статусів за весь час.
            </>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Panel
              title={`Ефективність по ЖК · ${monthLabel(curKey)}`}
              note="Один місяць, відсортовано за кількістю поданих заявок."
              metric="Ефективність по ЖК"
              action={
                <ExportXlsx
                  fileName={`dim9000-sla-${curKey}`}
                  sheetName="SLA по ЖК"
                  sheet={buildSheet(complexesCur, [
                    { header: "ЖК", value: (c) => c.complex_name, width: 26 },
                    { header: "Створено", value: (c) => c.created_count },
                    { header: "Виконано", value: (c) => c.completed_count },
                    { header: "Відхилено", value: (c) => c.canceled_count },
                    {
                      header: "Міс. в міс.",
                      value: (c: SlaMonthly) =>
                        rate(c.completed_same_month_count, c.created_count),
                      format: "0.0%",
                      width: 14,
                    },
                    { header: "В процесі", value: (c) => c.backlog_end_of_month },
                  ])}
                />
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ЖК</TableHead>
                    <TableHead className="text-right">Створено</TableHead>
                    <TableHead className="text-right">Виконано</TableHead>
                    <TableHead className="text-right">Міс. в міс.</TableHead>
                    <TableHead className="text-right">В процесі</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complexesCur.map((c) => (
                    <TableRow key={c.complex_id}>
                      <TableCell className="font-medium">
                        {c.complex_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(c.created_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(c.completed_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(
                          rate(c.completed_same_month_count, c.created_count)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(c.backlog_end_of_month)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {complexesCur.length > 0 && (
                    <TableRow className="border-t-2 font-semibold hover:bg-transparent">
                      <TableCell>Загальний підсумок</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(curTotals.created_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(curTotals.completed_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(
                          rate(
                            curTotals.completed_same_month_count,
                            curTotals.created_count
                          )
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(curTotals.backlog_end_of_month)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Panel>

            <Panel
              title="Статуси за весь час"
              note={`Усі ${n(allTime)} заявок з моменту запуску CRM (групові — по одній). Тестові ЖК виключені: у старому звіті на цьому блоці фільтра не було взагалі. Фільтри сторінки сюди не застосовуються.`}
              contentClassName="flex-1"
            >
              <BklitDonut
                data={donut}
                centerLabel="Заявок"
                maxSlices={3}
                size={196}
              />
            </Panel>
          </div>
        </Section>
      </PageBody>
    </>
  );
}

/**
 * Зведена «ЖК × місяць» — рядок на ЖК, група колонок на місяць.
 *
 * Живе тут, а не в components/: обидва її використання на цій сторінці, і
 * форма (`SlaMonthly` у клітинці) прив'язана саме до SLA. Виносити варто,
 * коли з'явиться третій виклик з іншої сторінки.
 */
function ComplexPivot({
  months,
  rows,
  columns,
  breakdown,
}: {
  months: string[];
  rows: ComplexPivotRow[];
  columns: Array<{
    header: string;
    value: (r: SlaMonthly) => string;
    muted?: boolean;
  }>;
  /**
   * Розклад клітинки по категоріях під курсором (ANA-20). Необовʼязковий:
   * зведена лишається читабельною і без нього.
   */
  breakdown?: (row: ComplexPivotRow, monthKey: string) => Breakdown | null;
}) {
  // Найсвіжіший місяць таблиці. `months` іде від нового до старого — той
  // самий порядок, у якому їх малює Looker і в якому їх читають.
  const latest =
    breakdown && months.length
      ? (row: ComplexPivotRow) => breakdown(row, months[0])
      : null;

  /**
   * Рядок «Загальний підсумок» (ANA-9, прохання Максима: «додати сумуючий
   * рядок до таблиць в SLA як було в v1.0; якщо сумуємо відсотки, то
   * виводимо абсолютне значення суми»).
   *
   * Підсумок — це СИНТЕТИЧНА клітинка з просумованими лічильниками, яку
   * потім проганяють через ті самі `columns`, що й звичайні рядки. Тому
   * відсоток у ньому неминуче рахується від абсолютів (сума виконаних /
   * сума створених), а не як середнє з відсотків по ЖК: порахувати інакше
   * тут фізично нема де. Той самий прийом, що й у колонці «Разом» зведеної
   * по місяцях.
   *
   * ⚠️ «В процесі» підсумовується — і це коректно саме ПО ЖК: черги різних
   * ЖК не перетинаються, тож їхня сума і є черга компанії. По МІСЯЦЯХ той
   * самий стовпчик складати не можна (вийшла б сума залишків), тому в
   * зведеній по місяцях для нього окреме правило.
   */
  const totalByMonth = new Map<string, SlaMonthly>();
  for (const m of months) {
    const cells = rows
      .map((r) => r.byMonth.get(m))
      .filter((c): c is SlaMonthly => !!c);
    if (!cells.length) continue;
    const pick = (f: (c: SlaMonthly) => number) =>
      cells.reduce((acc, c) => acc + f(c), 0);
    totalByMonth.set(m, {
      report_month_key: m,
      complex_id: TOTAL_ID,
      complex_name: "Загальний підсумок",
      created_count: pick((c) => c.created_count),
      completed_count: pick((c) => c.completed_count),
      canceled_count: pick((c) => c.canceled_count),
      completed_same_month_count: pick((c) => c.completed_same_month_count),
      backlog_end_of_month: pick((c) => c.backlog_end_of_month),
    });
  }
  const totalPivotRow: ComplexPivotRow = {
    complex_id: TOTAL_ID,
    complex_name: "Загальний підсумок",
    byMonth: totalByMonth,
    total: 0,
  };
  const totalLatest = latest?.(totalPivotRow) ?? null;

  return (
    <CellBreakdownProvider>
    <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_th]:h-9 [&_th]:px-2 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr className="border-b">
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-card text-left align-bottom whitespace-nowrap"
              >
                Комплекс
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  colSpan={columns.length}
                  className="border-l text-center whitespace-nowrap"
                >
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
            <tr className="border-b">
              {months.map((m) =>
                columns.map((c, i) => (
                  <th
                    key={`${m}-${c.header}`}
                    className={
                      i === 0
                        ? "border-l text-right whitespace-nowrap"
                        : "text-right whitespace-nowrap"
                    }
                  >
                    {c.header}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // Назва ЖК показує розклад НАЙСВІЖІШОГО місяця таблиці — саме
              // про нього питають, коли ведуть курсором по рядку. Решта
              // місяців доступні через свою колонку «Всього».
              const rowLatest = latest?.(row) ?? null;
              return (
              <tr key={row.complex_id} className="border-b hover:bg-muted/40">
                <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium whitespace-nowrap">
                  {rowLatest ? (
                    <CellBreakdown data={rowLatest}>
                      {row.complex_name}
                    </CellBreakdown>
                  ) : (
                    row.complex_name
                  )}
                </td>
                {months.map((m) => {
                  const cell = row.byMonth.get(m);
                  // Розклад висить на ПЕРШІЙ колонці місяця («Всього») — саме
                  // це число він і ділить на категорії. Вішати ту саму
                  // картку на «Виконано» було б неправдою: там інший набір
                  // заявок (рахунок по даті закриття).
                  const detail = cell ? breakdown?.(row, m) : null;
                  return columns.map((c, i) => (
                    <td
                      key={`${m}-${c.header}`}
                      className={[
                        "px-2 py-1.5 text-right tabular-nums",
                        i === 0 ? "border-l" : "",
                        c.muted ? "text-muted-foreground" : "",
                      ].join(" ")}
                    >
                      {!cell ? (
                        "—"
                      ) : i === 0 && detail ? (
                        <CellBreakdown data={detail}>{c.value(cell)}</CellBreakdown>
                      ) : (
                        c.value(cell)
                      )}
                    </td>
                  ));
                })}
              </tr>
              );
            })}

            {rows.length > 0 && (
              <tr className="border-t-2 font-semibold">
                <td className="sticky left-0 z-10 bg-card px-2 py-1.5 whitespace-nowrap">
                  {totalLatest ? (
                    <CellBreakdown data={totalLatest}>
                      Загальний підсумок
                    </CellBreakdown>
                  ) : (
                    "Загальний підсумок"
                  )}
                </td>
                {months.map((m) => {
                  const cell = totalByMonth.get(m);
                  const detail = cell ? breakdown?.(totalPivotRow, m) : null;
                  return columns.map((c, i) => (
                    <td
                      key={`total-${m}-${c.header}`}
                      className={[
                        "px-2 py-1.5 text-right tabular-nums",
                        i === 0 ? "border-l" : "",
                        c.muted ? "text-muted-foreground" : "",
                      ].join(" ")}
                    >
                      {!cell ? (
                        "—"
                      ) : i === 0 && detail ? (
                        <CellBreakdown data={detail}>{c.value(cell)}</CellBreakdown>
                      ) : (
                        c.value(cell)
                      )}
                    </td>
                  ));
                })}
              </tr>
            )}
          </tbody>
        </table>
    </div>
    </CellBreakdownProvider>
  );
}
