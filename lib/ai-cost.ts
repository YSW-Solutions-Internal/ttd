// The AI log's cost estimate (README Afterwards #18). No imports, so the test runs under plain `node`.

/** US$ per million tokens at list price. A model not listed (a fallback) has no estimate. */
export const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

export type CallTokens = {
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_write_tokens: number | null;
  cache_read_tokens: number | null;
};

/**
 * US$ for one call, or null for an unpriced model. `partial` when it was logged before the cache
 * counts were (migration 0035), so the cached prompt is missing and the figure is too low.
 */
export function callCost(c: CallTokens): { usd: number; partial: boolean } | null {
  const p = PRICES[c.model];
  if (!p) return null;
  const usd =
    ((c.input_tokens ?? 0) * p.input +
      (c.output_tokens ?? 0) * p.output +
      (c.cache_write_tokens ?? 0) * p.cacheWrite +
      (c.cache_read_tokens ?? 0) * p.cacheRead) /
    1e6;
  return { usd, partial: c.input_tokens !== null && c.cache_write_tokens === null };
}
