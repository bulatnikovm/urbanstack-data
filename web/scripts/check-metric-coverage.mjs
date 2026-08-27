/**
 * Кожна картка дашборду має мати запис у реєстрі метрик.
 *
 *   node scripts/check-metric-coverage.mjs
 *
 * Навіщо окрема перевірка. Довідка шукається за ПІДПИСОМ картки
 * (`getMetric(label)`), і якщо запису немає — іконка «i» просто не
 * зʼявляється. Мовчки. Ні помилки, ні попередження. Так і накопичилось
 * 21 картка без довідки з 52: підписи міняли, нові блоки додавали, реєстр
 * лишався позаду, і помітити це можна було тільки випадково.
 *
 * Це рівно той механізм розходження, який ми викорчовували з хардкод-списків
 * будинків (CLAUDE.md, баг #1): дублювання, де розсинхрон нічим не карається.
 * Тому перевірка падає на збірці, а не «має бути помітно».
 *
 * Обмеження: парсимо JSX регуляркою, а не AST — беремо `label`/`title` й
 * `metric` з відкривального тега `<Kpi>`/`<Panel>`. Динамічний заголовок
 * (шаблонний рядок) обовʼязково потребує явного `metric="…"`, інакше картка
 * тут і впаде.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");
const REGISTRY = join(WEB, "data", "metrics.json");

/**
 * Картки, які не є метриками. Тільки службовий UI — порожній стан і
 * адмінка. Усе, що показує ЦИФРУ ПРО ПРОДУКТ, сюди потрапляти не має:
 * список задуманий як виняток на два рядки, а не як спосіб глушити
 * перевірку.
 */
const NOT_METRICS = new Set([
  "Немає даних за обраний фільтр",
  "Даних ще немає",
  "`Команда — ${users.length}`",
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Кінець відкривального тега: перший `>` поза {} і поза рядками. */
function tagEnd(src, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return src.length;
}

const labels = new Set(
  JSON.parse(readFileSync(REGISTRY, "utf8")).metrics.map((m) => m.label)
);

const cards = [];
for (const file of [...walk(join(WEB, "app")), ...walk(join(WEB, "components"))]) {
  const src = readFileSync(file, "utf8");
  const re = /<(Kpi|Panel)\b/g;
  let m;
  while ((m = re.exec(src))) {
    const body = src.slice(m.index, tagEnd(src, m.index + m[1].length + 1));
    const key = m[1] === "Kpi" ? "label" : "title";
    const literal = body.match(new RegExp(`${key}=["']([^"']+)["']`));
    const template = body.match(new RegExp(`${key}=\\{\`([^\`]+)\``));
    // metric="…" або metric={["…", "…"]}
    const single = body.match(/metric=["']([^"']+)["']/);
    const list = body.match(/metric=\{\[([\s\S]*?)\]\}/);
    const keys = list
      ? [...list[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1])
      : single
        ? [single[1]]
        : null;

    cards.push({
      file: relative(WEB, file).replace(/\\/g, "/"),
      line: src.slice(0, m.index).split("\n").length,
      tag: m[1],
      title: literal?.[1] ?? (template ? "`" + template[1] + "`" : "(динамічний)"),
      keys,
    });
  }
}

const problems = [];
for (const card of cards) {
  const keys = card.keys ?? [card.title];
  if (!card.keys && NOT_METRICS.has(card.title)) continue;
  const unknown = keys.filter((k) => !labels.has(k));
  if (unknown.length) problems.push({ card, unknown });
}

const covered = cards.length - problems.length;
console.log(`✓ довідка є на ${covered} картках з ${cards.length}`);

if (problems.length) {
  console.error(`\n✗ ${problems.length} картк(и) без запису в реєстрі:\n`);
  for (const { card, unknown } of problems) {
    console.error(`  ${card.file}:${card.line}  <${card.tag}> ${card.title}`);
    console.error(`     немає в реєстрі: ${unknown.join(", ")}`);
  }
  console.error(
    `\nДодай метрику в docs/metrics.yml або вкажи існуючий ключ:` +
      ` metric="…" / metric={["…","…"]}.\n`
  );
  process.exit(1);
}

// Зворотний бік: запис у реєстрі, якого вже немає на дашборді. Не помилка
// (метрику могли тимчасово прибрати з UI), але про це варто знати — інакше
// реєстр обростає описами того, чого ніхто не бачить.
const used = new Set(cards.flatMap((c) => c.keys ?? [c.title]));
const orphans = [...labels].filter((l) => !used.has(l));
if (orphans.length) {
  console.log(`  ⓘ у реєстрі є, на дашборді не показується: ${orphans.join(", ")}`);
}
