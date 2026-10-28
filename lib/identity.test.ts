import { test } from "node:test";
import assert from "node:assert/strict";
import { isExpired, orderIdentities, type IdentityValues } from "./identity.ts";

const doc = (id: string, kind: "id" | "passport", issued_on: string | null, expires_on: string | null): IdentityValues => ({
  id, kind, number: "X", nationality: null, issued_on, expires_on, name_as_printed: null, image_path: null,
});

test("the ID comes first, then Passports issued last first", () => {
  const order = orderIdentities([
    doc("old", "passport", "2015-01-01", "2025-01-01"),
    doc("new", "passport", "2024-06-01", "2034-06-01"),
    doc("id", "id", null, null),
    doc("mid", "passport", "2020-03-01", "2030-03-01"),
  ]).map((d) => d.id);
  assert.deepEqual(order, ["id", "new", "mid", "old"]);
});

test("only Passports past their expiry date are expired", () => {
  assert.equal(isExpired(doc("a", "passport", "2015-01-01", "2025-01-01"), "2026-10-28"), true);
  assert.equal(isExpired(doc("b", "passport", "2020-01-01", "2026-10-28"), "2026-10-28"), false);
  assert.equal(isExpired(doc("c", "id", null, "2000-01-01"), "2026-10-28"), false);
});
