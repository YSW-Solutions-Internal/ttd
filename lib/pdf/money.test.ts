import { test } from "node:test";
import assert from "node:assert/strict";
import { itemTotal, money, num, totalText } from "./money.ts";

test("num reads numbers from JSON", () => {
  assert.equal(num("3 980.40"), 3980.4);
  assert.equal(num(null), 0);
  assert.equal(num("", 1), 1);
  assert.equal(num("  ", 1), 1);
  assert.equal(num("1,000"), 0);
  assert.equal(num("abc", 5), 5);
});

test("money is Rand, thousands grouped with spaces", () => {
  assert.equal(money(1234567.891), "R 1 234 567.89");
  assert.equal(money(0), "R 0.00");
  assert.equal(money(-1500), "R -1 500.00");
  assert.equal(money("999.995"), "R 1 000.00");
});

test("Item total adds Transaction fee and Markup; Pre-payment fee only when prepaid", () => {
  const item = { price: 1000, transaction_fee: 150, markup: "50", prepayment_fee: 300, refund_fee: 900, change_fee: 900 };
  assert.equal(itemTotal(item), 1200);
  assert.equal(itemTotal({ ...item, prepaid: true }), 1500);
});

test("Accommodation Transaction fee is per room", () => {
  assert.equal(itemTotal({ price: 1000, transaction_fee: 300 }, 2), 1600);
  assert.equal(itemTotal({ price: 1000, transaction_fee: 300 }, 0), 1300); // at least one room
});

test("a missing price is On request, never R 0.00 plus fees", () => {
  assert.equal(itemTotal({ price: null, transaction_fee: 150 }), null);
  assert.equal(totalText({ transaction_fee: 150 }), "On request");
  assert.equal(totalText({ price: 0 }), "R 0.00");
});
