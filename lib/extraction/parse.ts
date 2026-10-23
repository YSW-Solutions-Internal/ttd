import { randomUUID } from "node:crypto";
import type { ExtractedItem, ExtractionResult, ItemKind } from "./types";

// Only `import type` above, so this file also runs under plain `node` for parse.test.mjs.
const KINDS = ["flight", "hotel", "car_rental", "excursion"] as const satisfies readonly ItemKind[];

/** Wire fields that carry a number as a digit string (see schema.ts). */
const NUMBER_KEYS = new Set(["amount", "stops", "count", "star", "nights"]);

/** "13111.80" -> 13111.8. Anything that is not plain digits with at most one "." is unreadable: null. */
export function toNumber(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * Type coercion only, never value correction:
 *  - "" and the four-character string "null" become a real null
 *  - digit strings in NUMBER_KEYS fields become numbers
 */
export function normaliseNulls(value: unknown, key?: string): unknown {
  if (key && NUMBER_KEYS.has(key)) return toNumber(value);
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t.toLowerCase() === "null" ? null : value;
  }
  if (Array.isArray(value)) return value.map((v) => normaliseNulls(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseNulls(v, k)]));
  }
  return value;
}

/** Turn the schema-shaped answer into stored Items, each with a stable entity_id. */
export function toExtractionResult(raw: unknown): ExtractionResult {
  const obj = normaliseNulls(raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") throw new Error("Model answer is not a JSON object.");

  const items: ExtractedItem[] = KINDS.flatMap((kind) => {
    const list = obj[kind];
    if (!Array.isArray(list)) throw new Error(`Model answer is missing the "${kind}" array.`);
    return list.map((data) => ({
      entity_id: `${kind}_${randomUUID().slice(0, 8)}`,
      kind,
      data: data as Record<string, unknown>,
    }));
  });

  const type = obj.source_type as string | null;
  return {
    items,
    source:
      type && type !== "NONE"
        ? { type, confidence: obj.source_confidence as string, reason: obj.source_reason as string | null }
        : null,
  };
}
