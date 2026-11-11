import { test } from "node:test";
import assert from "node:assert/strict";
import { callCost } from "./ai-cost.ts";

test("callCost prices every kind of token, and flags rows logged before the cache counts", () => {
  const base = { model: "claude-sonnet-5-5", input_tokens: 1_000_000, output_tokens: 100_000, cache_write_tokens: 0, cache_read_tokens: 1_000_000 };
  assert.deepEqual(callCost(base), { usd: 2 + 1 + 0.2, partial: false });
  assert.deepEqual(callCost({ ...base, cache_write_tokens: null, cache_read_tokens: null }), { usd: 3, partial: true });
  // A failed call logs no tokens at all: nothing is missing, it just cost nothing we know of.
  assert.deepEqual(callCost({ ...base, input_tokens: null, output_tokens: null, cache_write_tokens: null, cache_read_tokens: null }), { usd: 0, partial: false });
  assert.equal(callCost({ ...base, model: "claude-opus-5-5" }), null);
});
