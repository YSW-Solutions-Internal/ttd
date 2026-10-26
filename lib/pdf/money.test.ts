import { test } from "node:test";
import assert from "node:assert/strict";
import { flightTotal, money, num, symFor, withFees } from "./money.ts";

test("num reads numbers the way render_lib did", () => {
  assert.equal(num("3 980.40"), 3980.4);
  assert.equal(num(null), 0);
  assert.equal(num("", 1), 1);
  assert.equal(num("  ", 1), 1);
  assert.equal(num("1,000"), 0); // Python's float("1,000") fails too
  assert.equal(num("abc", 5), 5);
});

test("money groups thousands with spaces", () => {
  assert.equal(money(1234567.891, "R"), "R 1 234 567.89");
  assert.equal(money(0, "€"), "€ 0.00");
  assert.equal(money(-1500, "R"), "R -1 500.00");
  assert.equal(money(999.995, "$"), "$ 1 000.00");
});

test("unknown currencies show their code, missing means rand", () => {
  assert.equal(symFor("AUD"), "AUD");
  assert.equal(symFor(null), "R");
  assert.equal(symFor("GBP"), "£");
});

test("only markup and transaction fee are added to a total", () => {
  assert.equal(withFees({ markup: 100, transaction_fee: "50", cancellation_fee: 900, change_fee: 900 }, 1000), 1150);
});

test("flight total: (fare + taxes) x count per line, count below 1 counts as 1, plus fees", () => {
  const pricing = {
    lines: [
      { count: 2, fare_pp: 100, taxes_pp: "10" },
      { count: 0, fare_pp: 50, taxes_pp: 5 },
      { count: 2.7, fare_pp: 1, taxes_pp: 0 },
    ],
    markup: 20,
    transaction_fee: 5,
  };
  assert.equal(flightTotal(pricing), 220 + 55 + 2 + 25);
});
