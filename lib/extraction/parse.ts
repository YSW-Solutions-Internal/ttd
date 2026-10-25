import { randomUUID } from "node:crypto";
import type { ExtractedItem, ExtractionResult, ItemKind } from "./types";

// Only `import type` above, so this file also runs under plain `node` for parse.test.mjs.
const KINDS = ["flight", "hotel", "car_rental", "excursion", "transfer", "rail"] as const satisfies readonly ItemKind[];

/** Wire fields that carry a number as a digit string (see schema.ts). */
const NUMBER_KEYS = new Set(["price", "total_price", "fare_pp", "taxes_pp", "stops", "count", "star", "nights", "rooms", "passengers"]);

/** "13111.80" or 13111.8 -> 13111.8. Anything that is not plain digits with at most one "." is unreadable: null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
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

/**
 * The JSON object in Claude's answer. The shape is not enforced by the API (ADR 0003),
 * so tolerate a code fence or a stray sentence around it, and fail loudly otherwise.
 */
export function parseAnswer(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("The model's answer contained no JSON object.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The model's answer was not valid JSON.");
  }
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
        ? { type }
        : null,
  };
}
