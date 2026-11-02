import { test } from "node:test";
import assert from "node:assert/strict";
import { csvLine, parsePayment, statementMonth } from "./payments.ts";

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

test("statement months run to the first of the next month, December included", () => {
  assert.deepEqual(statementMonth("2026-12", "2026-11-01"), { month: "2026-12", from: "2026-12-01", to: "2027-01-01" });
  assert.equal(statementMonth("2026-13", "2026-11-01").month, "2026-11");
  assert.equal(statementMonth(undefined, "2026-11-01").to, "2026-12-01");
});

test("CSV values are quoted with quotes doubled", () => {
  assert.equal(csvLine(["Ore \"and\" Metal", 12.5, null]), '"Ore ""and"" Metal","12.5",""');
});
