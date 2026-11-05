import { test } from "node:test";
import assert from "node:assert/strict";
import { csvLine, moneyIn, parsePayment, statementMonth } from "./payments.ts";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

test("a Client Payment is in Rand whatever was typed; a Supplier one needs its Supplier and rate", () => {
  const client = parsePayment(form({ paid_on: "2026-10-30", amount: "1500,50", currency: "USD", account_id: "a", landed_account_id: "b" }), "client");
  assert.deepEqual([client.amount, client.currency, client.rate, client.supplier_id, client.landed_account_id], [1500.5, "ZAR", 1, null, "b"]);
  assert.throws(() => parsePayment(form({ paid_on: "2026-10-30", amount: "10", account_id: "a" }), "supplier"), /Supplier/);
  assert.throws(() => parsePayment(form({ paid_on: "2026-10-30", amount: "10", account_id: "a", supplier_id: "s", currency: "USD" }), "supplier"), /Rate/);
  assert.throws(() => parsePayment(form({ paid_on: "2026-10-30", amount: "-10", account_id: "a" }), "client"), /above 0/);
});

test("a Payment's kind defaults by side and must belong to it; money in or out follows the kind", () => {
  const base = { paid_on: "2026-11-02", amount: "10", account_id: "a", supplier_id: "s" };
  assert.equal(parsePayment(form(base), "supplier").kind, "paid");
  assert.equal(parsePayment(form(base), "client").kind, "received");
  assert.equal(parsePayment(form({ ...base, kind: "commission_in" }), "supplier").kind, "commission_in");
  assert.throws(() => parsePayment(form({ ...base, kind: "refund_out" }), "supplier"), /kind/i);
  assert.equal(moneyIn("refund_in"), true);
  assert.equal(moneyIn("refund_out"), false);
  assert.equal(moneyIn("paid"), false);
});

test("statement months run to the first of the next month, December included", () => {
  assert.deepEqual(statementMonth("2026-12", "2026-11-01"), { month: "2026-12", from: "2026-12-01", to: "2027-01-01" });
  assert.equal(statementMonth("2026-13", "2026-11-01").month, "2026-11");
  assert.equal(statementMonth(undefined, "2026-11-01").to, "2026-12-01");
});

test("CSV values are quoted with quotes doubled", () => {
  assert.equal(csvLine(["Ore \"and\" Metal", 12.5, null]), '"Ore ""and"" Metal","12.5",""');
});

test("csvLine keeps typed text from running as a formula, but not negative amounts", () => {
  assert.equal(csvLine(["=HYPERLINK(1)", "+27", "@SUM", "-1+2", "-12.50", -3]), `"'=HYPERLINK(1)","'+27","'@SUM","'-1+2","-12.50","-3"`);
});
