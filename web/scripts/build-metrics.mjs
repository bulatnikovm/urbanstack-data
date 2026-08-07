/**
 * docs/metrics.yml → web/data/metrics.json
 *
 * Той самий прийом, що й export-data.mjs для мартів: джерело правди лежить
 * поруч з рештою документації даних, а в репо дашборду (туди їде тільки
 * web/) потрапляє скомпільований артефакт.
 *
 *   node scripts/build-metrics.mjs
 *
 * Ключ у JSON — `label`, а не `id`: у компонентах картки підписані людською
 * назвою, і зіставляти по ній набагато менше шансів помилитись, ніж
 * розставляти PROD-XXX руками. Тому дублікати label — помилка збірки.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "docs", "metrics.yml");
const OUT = join(HERE, "..", "data", "metrics.json");

const REQUIRED = ["id", "label", "definition"];
const STATUSES = new Set(["active", "known_issue", "needs_decision"]);

const doc = parse(readFileSync(SRC, "utf8"));
const metrics = doc?.metrics ?? [];

const seenLabel = new Map();
const seenId = new Map();

for (const m of metrics) {
  for (const field of REQUIRED) {
    if (!m?.[field]) {
      throw new Error(`Метрика ${m?.id ?? "(без id)"}: немає поля "${field}"`);
    }
  }
  if (m.status && !STATUSES.has(m.status)) {
    throw new Error(
      `Метрика ${m.id}: невідомий статус "${m.status}". Дозволені: ${[...STATUSES].join(", ")}`
    );
  }
  if (seenId.has(m.id)) {
    throw new Error(`Дубльований id "${m.id}"`);
  }
  if (seenLabel.has(m.label)) {
    throw new Error(
      `Дубльований label "${m.label}" (${seenId.get(seenLabel.get(m.label)) ?? ""} і ${m.id}) — по ньому шукає UI`
    );
  }
  seenId.set(m.id, m.id);
  seenLabel.set(m.label, m.id);
}

// Однорядкові рядки: YAML-блоки (`>`) лишають переноси й хвостовий \n,
// а в тултипі це зайві порожні рядки.
const tidy = (v) =>
  typeof v === "string" ? v.replace(/\s*\n\s*/g, " ").trim() : v;

const compiled = metrics.map((m) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, tidy(v)]))
);

writeFileSync(
  OUT,
  JSON.stringify({ version: doc.version, updated: doc.updated, metrics: compiled }, null, 0) + "\n",
  "utf8"
);

console.log(`✓ ${compiled.length} метрик → web/data/metrics.json`);
const flagged = compiled.filter((m) => m.status && m.status !== "active");
if (flagged.length) {
  console.log(`  з позначкою: ${flagged.map((m) => `${m.id} (${m.status})`).join(", ")}`);
}
