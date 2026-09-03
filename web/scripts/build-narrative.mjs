/**
 * Наратив по аномаліях: шар B з dashboard_plan.md §7.2.
 *
 *   node scripts/build-narrative.mjs
 *
 * Читає web/data/insights.json (аномалії з srv_metric_anomalies) і реєстр
 * метрик, віддає 2-3 речення на кожну секцію дашборду → web/data/narrative.json.
 *
 * ── Три рішення, які тут закладені ────────────────────────────────────────
 *
 * 1. РАХУЄТЬСЯ ОДИН РАЗ ПІСЛЯ ОНОВЛЕННЯ ДАНИХ, не на кожен перегляд.
 *    Не заради економії: дашборд шеринговий, і якщо генерувати на льоту,
 *    Микита з Артемом побачать РІЗНІ формулювання про ті самі цифри. Далі
 *    буде «а в мене написано інакше» — і довіри до тексту не лишиться.
 *
 * 2. МОДЕЛЬ НЕ РАХУЄ ЧИСЕЛ. Усі числа приходять готовими рядками у фактах,
 *    а після генерації текст ПЕРЕВІРЯЄТЬСЯ: кожне число з тексту має бути
 *    серед дозволених. Не пройшло — секція відкочується на детермінований
 *    шаблон. Це перевірка, а не обіцянка в промпті.
 *
 * 3. СЕКЦІЇ БЕЗ АНОМАЛІЙ ВЗАГАЛІ НЕ ЙДУТЬ У МОДЕЛЬ. «Нічого незвичного» —
 *    це найчастіший і найважливіший випадок; давати моделі шанс щось про
 *    нього придумати немає жодної причини.
 *
 * Без OPENAI_API_KEY скрипт не падає, а віддає детерміновані шаблони —
 * `npm run refresh` має працювати й без ключа.
 *
 * 4. МОДЕЛЬ ВЗАЄМОЗАМІННА. Зараз OpenAI `gpt-5.6-luna`, перемикається
 *    змінною NARRATIVE_MODEL без правки коду. Від моделі тут потрібні лише
 *    2-3 речення по готових фактах; за правильність чисел відповідає
 *    перевірка (п.2), а не вибір постачальника.
 */

import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const MODEL = process.env.NARRATIVE_MODEL ?? "gpt-5.6-luna";

/**
 * Зусилля на міркування. Задача вузька — переказати готові факти, — тому
 * дефолт низький: довші міркування тут не роблять текст точнішим, лише
 * дорожчим.
 */
const EFFORT = process.env.NARRATIVE_EFFORT ?? "low";

const SECTION_TITLE = {
  audience: "Аудиторія",
  activation: "Активація",
  engagement: "Залученість",
  star: "STAR",
  health: "Стан додатку",
};

const MONTH_UA = [
  "січні", "лютому", "березні", "квітні", "травні", "червні",
  "липні", "серпні", "вересні", "жовтні", "листопаді", "грудні",
];

// ── Форматування чисел ────────────────────────────────────────────────────
// Один формат на весь конвеєр: і у фактах для моделі, і в перевірці, і в
// шаблонах. Якби їх було два, перевірка почала б відхиляти правильний текст.

const nf = (min, max) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

export function formatValue(value, valueType) {
  if (value === null || value === undefined) return "—";
  switch (valueType) {
    case "rate":
      return `${nf(1, 1).format(value * 100)}%`;
    case "duration":
      return `${nf(1, 1).format(value)} хв`;
    case "amount":
      return `${nf(0, 0).format(Math.round(value))} ₴`;
    default:
      return nf(0, 0).format(Math.round(value));
  }
}

export const formatPct = (v) =>
  v === null || v === undefined
    ? "—"
    : `${v > 0 ? "+" : "−"}${nf(1, 1).format(Math.abs(v * 100))}%`;

/**
 * Нормалізація числа до порівнюваного вигляду: прибираємо групувальні
 * пробіли (Intl для uk-UA ставить U+00A0), кому міняємо на крапку, знаки й
 * одиниці відкидаємо. "1 271" і "1271" мають збігтися.
 */
export const normalizeNumber = (s) =>
  s
    .replace(/[\s  ]/g, "")
    .replace(",", ".")
    .replace(/^[+\-−]/, "")
    .replace(/[%₴]/g, "")
    .replace(/хв$/, "");

/** Усі числоподібні токени тексту. */
export function extractNumbers(text) {
  const out = [];
  const re = /[+\-−]?\d[\d\s  ]*(?:[.,]\d+)?\s*[%₴]?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = normalizeNumber(m[0]);
    if (n) out.push(n);
  }
  return out;
}

// ── Факти ─────────────────────────────────────────────────────────────────

export function buildFact(row, registry, index) {
  const metric = registry.get(row.metric_id);
  /**
   * Підпис беремо з РЯДУ (`label_ua` з seed'а), а не з картки реєстру: одна
   * картка покриває кілька рядів, і підпис реєстру назвав би три різні
   * показники однаково. Реєстр за metric_id лишається джерелом визначення
   * й відомих проблем — того, що в ряді не записано.
   */
  const label = row.label_ua ?? metric?.label ?? row.series_key;
  const scope =
    row.dimension_key === "total" ? "по компанії" : `розріз: ${row.dimension_value}`;

  return {
    id: `F${index + 1}`,
    metric_label: label,
    scope,
    definition: metric?.definition ?? null,
    known_issue: metric?.status === "known_issue" ? metric.note ?? null : null,
    value: formatValue(row.value, row.value_type),
    previous_value: formatValue(row.prev_value, row.value_type),
    change_vs_previous_month: formatPct(row.mom_pct),
    direction: row.direction === "up" ? "зросло" : "впало",
    is_good: row.impact,
    severity: row.severity,
    why_flagged: row.verdict,
    suspected_data_problem: row.is_suspected_data_gap === true,
  };
}

/** Числа, які моделі дозволено вживати. */
export function allowedNumbers(facts) {
  const set = new Set();
  for (const f of facts) {
    for (const v of [f.value, f.previous_value, f.change_vs_previous_month]) {
      const n = normalizeNumber(String(v));
      if (n) set.add(n);
    }
  }
  // Дрібні цілі — це підрахунки самих фактів («три показники»), не вигадані
  // метрики. Ширше не пускаємо.
  for (let i = 1; i <= 12; i += 1) set.add(String(i));
  return set;
}

// ── Детермінований шаблон (запасний варіант і «нічого не сталось») ────────

export function templateForSection(facts, monthLabel) {
  if (facts.length === 0) {
    return `У ${monthLabel} нічого незвичного: усі показники секції лишились у межах власної мінливості.`;
  }
  const parts = facts.slice(0, 3).map((f) => {
    const gap = f.suspected_data_problem
      ? " (схоже на проблему з даними, не на продуктову подію)"
      : "";
    return `«${f.metric_label}» (${f.scope}) ${f.direction} до ${f.value} — ${f.change_vs_previous_month} до попереднього місяця${gap}`;
  });
  const more =
    facts.length > 3 ? ` Ще ${facts.length - 3} відхилень у цій секції.` : "";
  return `У ${monthLabel}: ${parts.join("; ")}.${more}`;
}

// ── Генерація ─────────────────────────────────────────────────────────────

const NarrativeSchema = z.object({
  sections: z.array(
    z.object({
      section: z.string(),
      text: z.string(),
    })
  ),
});

const SYSTEM = `Ти пишеш короткі фактичні підсумки для внутрішнього продуктового дашборду української proptech-компанії UrbanStack. Читачі — CEO і продакт-менеджер.

ЖОРСТКІ ПРАВИЛА:
1. Пиши українською, 2-3 речення на секцію. Без вступів на кшталт «У цьому місяці ми бачимо».
2. Уживай ТІЛЬКИ ті числа, що є в фактах. Не рахуй нових чисел: не додавай, не віднімай, не переводь у відсотки, не підсумовуй. Якщо числа немає у фактах — не пиши його.
3. Не вигадуй причин. Дані не кажуть, ЧОМУ показник змінився. Можна сказати, що змінилось і наскільки; не можна — «через новий реліз» чи «бо користувачі втомились».
4. Називай метрику так, як вона підписана в полі metric_label.
5. Якщо suspected_data_problem = true, прямо скажи, що це схоже на проблему з даними, а не на подію в продукті.
6. Якщо в секції кілька фактів про один сюжет (та сама подія в різних розрізах) — розкажи це як ОДИН сюжет, не перелічуй тричі.
7. Не давай рекомендацій і не став завдань. Тільки що сталось.`;

async function generate(sectionFacts, monthLabel) {
  const client = new OpenAI();

  const payload = Object.entries(sectionFacts).map(([section, facts]) => ({
    section,
    section_title: SECTION_TITLE[section] ?? section,
    facts,
  }));

  const response = await client.responses.parse({
    model: MODEL,
    instructions: SYSTEM,
    reasoning: { effort: EFFORT },
    text: { format: zodTextFormat(NarrativeSchema, "narrative") },
    input: [
      {
        role: "user",
        content:
          `Звітний місяць: ${monthLabel}.` +
          `

Нижче — секції дашборду й аномалії, знайдені детектором. ` +
          `Напиши підсумок для КОЖНОЇ секції зі списку.

` +
          JSON.stringify(payload, null, 2),
      },
    ],
  });

  /**
   * Відмову треба ловити окремо: у Responses API вона приїжджає НЕ помилкою,
   * а блоком `refusal` у відповіді, і output_parsed при цьому порожній. Без
   * явної перевірки це виглядало б як «не вдалось розібрати» і ховало
   * справжню причину.
   */
  const refusal = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((c) => c.type === "refusal");
  if (refusal) {
    throw new Error(`модель відмовилась відповідати: ${refusal.refusal}`);
  }
  if (response.status === "incomplete") {
    throw new Error(
      `відповідь обірвана (${response.incomplete_details?.reason ?? "причина невідома"})`
    );
  }
  if (!response.output_parsed) {
    throw new Error("не вдалось розібрати структуровану відповідь");
  }

  const u = response.usage;
  if (u) {
    console.log(
      `модель ${MODEL} (effort=${EFFORT}): ${u.input_tokens} вх / ${u.output_tokens} вих токенів`
    );
  }
  return response.output_parsed.sections;
}

// ── Головне ───────────────────────────────────────────────────────────────

async function main() {
  const insights = JSON.parse(readFileSync(join(DATA, "insights.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(DATA, "_meta.json"), "utf8"));
  const registryRaw = JSON.parse(readFileSync(join(DATA, "metrics.json"), "utf8"));
  const registry = new Map(registryRaw.metrics.map((m) => [m.id, m]));

  // Звітний місяць наративу — ОСТАННІЙ ЗАКРИТИЙ, не поточний. Поточний
  // неповний за визначенням (docs/data_drift_findings.md §B), і говорити про
  // нього «показник впав» означало б щомісяця повторювати одну й ту саму
  // неправду першого числа.
  const snap = new Date(meta.snapshot_at);
  const target = new Date(Date.UTC(snap.getUTCFullYear(), snap.getUTCMonth() - 1, 1));
  const monthKey = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthLabel = `${MONTH_UA[target.getUTCMonth()]} ${target.getUTCFullYear()}`;

  const rows = insights.filter((r) => r.report_month_key === monthKey);

  const sections = Object.keys(SECTION_TITLE);
  const factsBySection = {};
  for (const s of sections) {
    factsBySection[s] = rows
      .filter((r) => r.dashboard_section === s)
      .map((r, i) => buildFact(r, registry, i));
  }

  const withFacts = Object.fromEntries(
    Object.entries(factsBySection).filter(([, f]) => f.length > 0)
  );

  console.log(`місяць наративу: ${monthKey} (${monthLabel})`);
  for (const s of sections) {
    console.log(`  ${s.padEnd(12)} ${factsBySection[s].length} аномалій`);
  }

  const out = {};
  let generated = null;
  let mode = "template";

  if (Object.keys(withFacts).length === 0) {
    console.log("аномалій немає — наратив детермінований, модель не викликається");
  } else if (!process.env.OPENAI_API_KEY) {
    console.log("⚠ OPENAI_API_KEY не заданий — детерміновані шаблони");
  } else {
    try {
      generated = await generate(withFacts, monthLabel);
      mode = "llm";
    } catch (err) {
      console.log(`⚠ генерація впала (${err.message}) — детерміновані шаблони`);
    }
  }

  /**
   * Ключ секції звіряємо ТЕРПИМО, і це не косметика.
   *
   * У payload їдуть і `section` ("audience"), і `section_title`
   * ("Аудиторія") — і модель час від часу вертає в полі `section` саме
   * заголовок, або той самий ключ в іншому регістрі. Строге порівняння
   * давало через раз тихий відкат на шаблон: текст згенеровано, гроші
   * витрачено, а на дашборді детермінований рядок і жодного сліду в логах.
   */
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const titleToKey = new Map(
    Object.entries(SECTION_TITLE).map(([key, title]) => [norm(title), key])
  );
  const genBySection = new Map();
  for (const g of generated ?? []) {
    const key = titleToKey.get(norm(g.section)) ?? norm(g.section);
    genBySection.set(key, g.text);
  }

  for (const s of sections) {
    const facts = factsBySection[s];
    const fallback = templateForSection(facts, monthLabel);
    const text = genBySection.get(s);

    if (!text) {
      /**
       * Секція без аномалій і не мала йти в модель — мовчимо. А от секція з
       * фактами, на яку модель нічого не повернула, — це збій, і він має
       * бути видний у логах разом з тим, ЩО модель насправді прислала.
       */
      if (facts.length > 0 && generated) {
        const got = (generated ?? []).map((g) => g.section).join(", ") || "нічого";
        console.log(`  ⚠ ${s}: модель не повернула секцію (прислала: ${got}) — шаблон`);
      }
      out[s] = { text: fallback, source: facts.length ? "template" : "no_anomalies" };
      continue;
    }

    // Перевірка заземлення: кожне число тексту має бути серед дозволених.
    const allowed = allowedNumbers(facts);
    const bad = extractNumbers(text).filter((n) => !allowed.has(n));

    if (bad.length > 0) {
      console.log(`  ⚠ ${s}: числа поза фактами [${bad.join(", ")}] — відкат на шаблон`);
      out[s] = { text: fallback, source: "template_rejected" };
    } else {
      out[s] = { text, source: "llm" };
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    snapshot_at: meta.snapshot_at,
    report_month_key: monthKey,
    report_month_label: monthLabel,
    model: mode === "llm" ? MODEL : null,
    sections: out,
  };

  writeFileSync(
    join(DATA, "narrative.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );

  console.log("");
  for (const s of sections) {
    console.log(`— ${SECTION_TITLE[s]} [${out[s].source}]`);
    console.log(`  ${out[s].text}\n`);
  }
  console.log("✓ web/data/narrative.json");
}

// Запускаємо main() тільки при прямому виклику — щоб тести могли імпортувати
// чисті функції (перевірку заземлення передусім) без побічних ефектів.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("✗ Наратив впав:", err.message);
    process.exit(1);
  });
}
