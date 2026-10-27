import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldParseError, parseAmount, parseChanged, type FormField } from "./form-values.ts";

const FIELDS: FormField[] = [
  { name: "price", label: "Price (R)", type: "money" },
  { name: "markup", label: "Markup (R)", type: "money" },
  { name: "prepaid", label: "Prepaid", type: "checkbox" },
  { name: "notes", label: "Notes", type: "textarea" },
];

test("parseAmount accepts Rand amounts with at most 2 decimals", () => {
  assert.equal(parseAmount("1200", "Price"), 1200);
  assert.equal(parseAmount("1200.50", "Price"), 1200.5);
  assert.equal(parseAmount("1,5", "Price"), 1.5);
  assert.equal(parseAmount("-50", "Markup"), -50);
  assert.equal(parseAmount("  ", "Price"), null);
});

test("parseAmount rejects anything else", () => {
  assert.throws(() => parseAmount("1200.505", "Price"), /Price must be an amount in Rand with at most 2 decimals/);
  assert.throws(() => parseAmount("1e3", "Price"));
  assert.throws(() => parseAmount("R1 200", "Price"));
});

test("parseChanged reads only fields that were sent", () => {
  const fd = new FormData();
  fd.set("notes", " hi ");
  fd.set("prepaid", "off");
  assert.deepEqual(parseChanged(FIELDS, fd), { notes: "hi", prepaid: false });
});

test("parseChanged names the bad field", () => {
  const fd = new FormData();
  fd.set("price", "1.234");
  assert.throws(
    () => parseChanged(FIELDS, fd),
    (e) => e instanceof FieldParseError && e.field === "price",
  );
});
