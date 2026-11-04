import { test } from "node:test";
import assert from "node:assert/strict";
import { cardSurcharge, feeUnits, itemTotal, money, num, totalText, tripTotal } from "./money.ts";

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

test("feeUnits and Card surcharge", () => {
  assert.equal(feeUnits("extra", { extra_type: "conference", people: 12 }), 12);
  assert.equal(feeUnits("extra", { extra_type: "preseat", people: 12 }), 1);
  assert.equal(feeUnits("hotel", { rooms: 2 }), 2);
  assert.equal(feeUnits("hotel", { rooms: 0 }), 1);
  assert.equal(itemTotal({ price: 0, transaction_fee: 230, markup: 0 }, 12), 2760);
  assert.equal(cardSurcharge({ price: 1000, transaction_fee: 300, markup: 100, card_paid: true }, 3, 0.0275), 55);
  assert.equal(cardSurcharge({ price: 1000, card_paid: false }, 1, 0.0275), null);
  assert.equal(itemTotal({ price: 1000, transaction_fee: 0, markup: 0, card_paid: true, card_surcharge: 27.5 }), 1027.5);
});

test("Trip total adds every Item total but recommended experiences; none while one is On request", () => {
  const q = {
    reference: "R", date: "", valid_until: "", consultant: { name: "" }, trip: {}, client: {},
    flight_options: [{ price: 1000, transaction_fee: 100 }, { price: 2000, transaction_fee: 100 }],
    accommodation: [{ options: [{ price: 500, transaction_fee: 50, rooms: 2 }] }],
    extras: [{ price: 0, transaction_fee: 40, units: 3 }],
    experiences: [{ price: 999 }, { price: null }],
  };
  assert.equal(tripTotal(q), 1100 + 2100 + 600 + 120);
  assert.equal(tripTotal({ ...q, transfers: [{ price: null }] }), null);
});
