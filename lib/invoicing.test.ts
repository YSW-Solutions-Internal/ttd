import { test } from "node:test";
import assert from "node:assert/strict";
import { changeCharge, expectsSupplierInvoice, invoicingStage, parseInvoice, parseLinkAmount } from "./invoicing.ts";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

test("a credit note is stored negative; a Client invoice is always in Rand", () => {
  const base = { number: "INV1", issued_on: "2026-11-01", amount: "1500,00", currency: "usd" };
  assert.equal(parseInvoice(form(base), "supplier").currency, "USD");
  assert.equal(parseInvoice(form({ ...base, credit_note: "on" }), "supplier").amount, -1500);
  assert.equal(parseInvoice(form(base), "client").currency, "ZAR");
  assert.throws(() => parseInvoice(form({ ...base, amount: "0" }), "client"), { field: "amount" });
  assert.equal(parseLinkAmount("200", true), -200);
});

test("a Cancellation with a refund is not invoiced; without one, its penalty and fee are", () => {
  const c = { kind: "cancellation" as const, extra_fare: 0, extra_taxes: 0, supplier_penalty: 10, rate: 18, agency_fee: 300, markup: 0, expected_refund: 4000 };
  assert.equal(changeCharge(c), 0);
  assert.equal(changeCharge({ ...c, expected_refund: 0 }), 480);
  assert.equal(expectsSupplierInvoice({ ...c, supplier_penalty: 0 }), false);
});

test("the stage: Invoiced first, then flag, then Supplier side", () => {
  const s = (o: Partial<Parameters<typeof invoicingStage>[0]>) =>
    invoicingStage({ charge: 1000, clientInvoiced: [], supplierStatuses: [], noneExpected: false, ...o });
  assert.deepEqual(s({}), { stage: "awaiting", toInvoice: 1000 });
  assert.equal(s({ supplierStatuses: ["verified", "query"] }).stage, "received");
  assert.equal(s({ supplierStatuses: ["verified"] }).stage, "verified");
  assert.equal(s({ noneExpected: true, supplierStatuses: ["verified"] }).stage, "none_expected");
  // Invoiced before the Supplier invoice arrives.
  assert.deepEqual(s({ clientInvoiced: [600, 400] }), { stage: "invoiced", toInvoice: 0 });
  // A credit note puts it back to invoice.
  assert.deepEqual(s({ clientInvoiced: [1000, -250], supplierStatuses: ["verified"] }), { stage: "verified", toInvoice: 250 });
  // Nothing to charge and nothing invoiced is not Invoiced.
  assert.equal(s({ charge: 0 }).stage, "awaiting");
});
