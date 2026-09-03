/**
 * Тести перевірки заземлення наративу.
 *
 *   node --test scripts/build-narrative.test.mjs
 *
 * Найважливіше тут — не форматування, а те, що ВИГАДАНЕ ЧИСЛО НЕ ПРОХОДИТЬ.
 * Промпт просить модель не рахувати; ці тести перевіряють, що коли вона
 * все-таки порахує, текст буде відхилено, а не показано СЕО.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedNumbers,
  extractNumbers,
  formatPct,
  formatValue,
  normalizeNumber,
  templateForSection,
} from "./build-narrative.mjs";

const facts = [
  {
    metric_label: "Користувачів із цільовою дією",
    scope: "розріз: 3. Голосування",
    value: formatValue(945, "count"),
    previous_value: formatValue(1096, "count"),
    change_vs_previous_month: formatPct(-0.1378),
    direction: "впало",
    suspected_data_problem: false,
  },
  {
    metric_label: "STAR від підтверджених",
    scope: "розріз: 3. Голосування",
    value: formatValue(0.0629, "rate"),
    previous_value: formatValue(0.0735, "rate"),
    change_vs_previous_month: formatPct(-0.1442),
    direction: "впало",
    suspected_data_problem: false,
  },
];

const allowed = allowedNumbers(facts);
const ungrounded = (text) => extractNumbers(text).filter((n) => !allowed.has(n));

test("числа з фактів проходять у будь-якому написанні", () => {
  // 945 у форматі uk-UA лишається "945"; 1096 отримує групувальний пробіл.
  assert.equal(ungrounded("Показник впав до 945 з 1 096.").length, 0);
  // Те саме число без пробілу теж має пройти — нормалізація їх зрівнює.
  assert.equal(ungrounded("Показник впав до 945 з 1096.").length, 0);
  assert.equal(ungrounded("STAR від підтверджених — 6,3%, було 7,4%.").length, 0);
  assert.equal(ungrounded("Зміна −13,8% до попереднього місяця.").length, 0);
});

test("ВИГАДАНЕ число не проходить", () => {
  // Класична галюцинація: модель сама відняла 1096 − 945.
  assert.deepEqual(ungrounded("Втрачено 151 користувача."), ["151"]);
  // Правдоподібне, але відсутнє у фактах.
  assert.deepEqual(ungrounded("Показник впав до 950."), ["950"]);
  // Перерахунок частки, якого ніхто не давав.
  assert.deepEqual(ungrounded("Це 14,4% від бази у 6 540 осіб."), ["6540"]);
});

test("дрібні цілі дозволені як підрахунок фактів", () => {
  assert.equal(ungrounded("Два показники відхилились.").length, 0);
  assert.equal(ungrounded("Обидва з 2 відхилень стосуються Голосування.").length, 0);
  // Але велике «структурне» число вже ні.
  assert.deepEqual(ungrounded("Усього 340 показників у нормі."), ["340"]);
});

test("нормалізація зрівнює пробіли, кому й одиниці", () => {
  assert.equal(normalizeNumber("1 096"), "1096");
  assert.equal(normalizeNumber("6,3%"), "6.3");
  assert.equal(normalizeNumber("−13,8%"), "13.8");
  assert.equal(normalizeNumber("1 234 567 ₴"), "1234567");
});

test("шаблон для секції без аномалій нічого не вигадує", () => {
  const text = templateForSection([], "липні 2026");
  assert.match(text, /нічого незвичного/);
  assert.equal(extractNumbers(text).join(","), "2026");
});

test("шаблон з фактами вживає лише числа з фактів", () => {
  const text = templateForSection(facts, "липні 2026");
  const bad = extractNumbers(text).filter((n) => !allowed.has(n) && n !== "2026");
  assert.deepEqual(bad, []);
});

test("прапорець проблеми з даними потрапляє в шаблон", () => {
  const gap = [{ ...facts[0], suspected_data_problem: true }];
  assert.match(templateForSection(gap, "липні 2026"), /проблему з даними/);
});
