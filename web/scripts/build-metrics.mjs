/**
 * docs/metrics.yml + docs/metrics_operational.yml → web/data/metrics.json
 *
 * Той самий прийом, що й export-data.mjs для мартів: джерело правди лежить
 * поруч з рештою документації даних, а в застосунок потрапляє скомпільований
 * артефакт.
 *
 *   node scripts/build-metrics.mjs
 *
 * Ключ у JSON — `label`, а не `id`: у компонентах картки підписані людською
 * назвою, і зіставляти по ній набагато менше шансів помилитись, ніж
 * розставляти PROD-XXX руками. Тому дублікати label — помилка збірки.
 *
 * Реєстрів ДВА, а вихід один: домени ведуться окремо (різні власники
 * методології, різний темп), але картки обох дашбордів шукають довідку тим
 * самим `getMetric(label)` зі спільного `dashboard.tsx`.
 *
 * Дублікат label — помилка збірки НАСКРІЗНО по обох реєстрах, не лише
 * всередині одного. Спокуса дозволити однаковий підпис у двох доменах була:
 * «Підтверджені» справді існує і як PROD-002, і як OPS-004 (той прямо каже
 * «аналог PROD-002»). Спробували віддавати обидва записи — на продуктовій
 * картці зʼявилась довідка «Підтверджені, Підтверджені» з двома блоками,
 * тобто читалось як баг. Тому підпис у реєстрі один, а картка, якій потрібен
 * саме інший домен, вказує його явно: `metric="Підтверджені (ЖК)"` при
 * підписі «Підтверджені» на екрані.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = {
  product: join(HERE, "..", "..", "docs", "metrics.yml"),
  operational: join(HERE, "..", "..", "docs", "metrics_operational.yml"),
};
const OUT = join(HERE, "..", "data", "metrics.json");

const REQUIRED = ["id", "label", "definition"];
const STATUSES = new Set(["active", "known_issue", "needs_decision"]);

// Однорядкові рядки: YAML-блоки (`>`) лишають переноси й хвостовий \n,
// а в тултипі це зайві порожні рядки.
const tidy = (v) =>
  typeof v === "string" ? v.replace(/\s*\n\s*/g, " ").trim() : v;

const tidyAll = (m) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, tidy(v)]));

/** id і label унікальні наскрізно по обох реєстрах. */
function validate(metrics, domain, seenId, seenLabel) {
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
        `Дубльований label "${m.label}" (${seenLabel.get(m.label)} і ${m.id}, ` +
          `реєстр ${domain}): по підпису шукає UI, тож він має бути один ` +
          `на обидва домени`
      );
    }
    seenId.set(m.id, domain);
    seenLabel.set(m.label, m.id);
  }
}

const compiled = [];
const versions = {};
const seenId = new Map();
const seenLabel = new Map();

for (const [domain, path] of Object.entries(SRC)) {
  const doc = parse(readFileSync(path, "utf8"));
  const metrics = doc?.metrics ?? [];
  versions[domain] = { version: doc.version, updated: doc.updated };
  validate(metrics, domain, seenId, seenLabel);
  for (const m of metrics) {
    compiled.push({ ...tidyAll(m), domain });
  }
}

writeFileSync(OUT, JSON.stringify({ versions, metrics: compiled }, null, 0) + "\n", "utf8");

console.log(`✓ ${compiled.length} метрик → web/data/metrics.json`);
for (const [domain] of Object.entries(SRC)) {
  const n = compiled.filter((m) => m.domain === domain).length;
  console.log(`  ${domain}: ${n}`);
}

const flagged = compiled.filter((m) => m.status && m.status !== "active");
if (flagged.length) {
  console.log(`  з позначкою: ${flagged.map((m) => `${m.id} (${m.status})`).join(", ")}`);
}
