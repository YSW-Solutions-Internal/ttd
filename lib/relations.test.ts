import { test } from "node:test";
import assert from "node:assert/strict";
import { everyRow } from "./relations.ts";

test("everyRow reads past a row limit smaller than its page", async () => {
  const all = [1, 2, 3, 4, 5];
  const capped = async (from: number, to: number) => ({ data: all.slice(from, Math.min(to + 1, from + 2)), error: null });
  assert.deepEqual(await everyRow(capped), all);
  await assert.rejects(everyRow(async () => ({ data: null, error: { message: "boom" } })), /boom/);
});
