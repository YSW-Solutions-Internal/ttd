import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationFee, changeTotal, parseBooking, parseChange, ticketNumbers } from "./booking.ts";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

test("a Rand booking is at rate 1 whatever was typed", () => {
  const b = parseBooking(form({ supplier: "XL", booking_reference: "ABC123", amount: "1500,50", rate: "17", expected_invoice_on: "2026-11-05" }));
  assert.equal(b.currency, "ZAR");
  assert.equal(b.rate, 1);
  assert.equal(b.amount, 1500.5);
});

test("a foreign booking needs a rate, and the expected invoice date is required", () => {
  const base = { supplier: "Viator", booking_reference: "V1", currency: "usd", amount: "100", expected_invoice_on: "2026-11-05" };
  assert.throws(() => parseBooking(form(base)), { field: "rate" });
  assert.equal(parseBooking(form({ ...base, rate: "18.25" })).currency, "USD");
  assert.throws(() => parseBooking(form({ ...base, rate: "18", expected_invoice_on: "" })), { field: "expected_invoice_on" });
});

test("a Change totals Supplier charges at its rate plus fee and Markup", () => {
  assert.equal(changeTotal({ extra_fare: 100, extra_taxes: 20, supplier_penalty: 10, rate: 18.5, agency_fee: 250, markup: 50 }), 2705);
});

test("a Change with Supplier charges needs an expected invoice date; a fee-only one does not", () => {
  assert.throws(() => parseChange(form({ happened_on: "2026-11-01", extra_fare: "500" }), "change"), { field: "expected_invoice_on" });
  assert.equal(parseChange(form({ happened_on: "2026-11-01", agency_fee: "350" }), "change").expected_invoice_on, null);
});

test("a Cancellation ignores fare and Markup and keeps the refund expected", () => {
  const c = parseChange(form({ happened_on: "2026-11-01", extra_fare: "999", markup: "99", agency_fee: "300", expected_refund: "4000" }), "cancellation");
  assert.deepEqual([c.extra_fare, c.markup, c.expected_refund], [0, 0, 4000]);
  assert.equal(cancellationFee({ transaction_fee: 300, refund_fee: 750 }, false), 300);
  assert.equal(cancellationFee({ transaction_fee: 300, refund_fee: 750 }, true), 750);
});

test("ticket numbers split on lines and commas", () => {
  assert.deepEqual(ticketNumbers("083 123, 083 124\n\n083 125 "), ["083 123", "083 124", "083 125"]);
});
