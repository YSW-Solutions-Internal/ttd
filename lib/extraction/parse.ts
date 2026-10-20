import { randomUUID } from "node:crypto";
import { ITEM_KINDS, type ExtractedItem, type ExtractionResult, type ItemKind } from "./types";

/** Models sometimes wrap JSON in code fences or add a sentence around it. Pull the object out. */
export function parseModelJson(text: string): unknown {
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) t = fenced[1];
  if (!t.startsWith("{")) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
  }
  return JSON.parse(t); // throws on invalid JSON: a loud failure, never a guess
}

/**
 * Type coercion only, never value correction:
 *  - the four-character string "null" becomes a real null
 *  - an empty string becomes null (project convention: STRING fields are null, never "")
 */
export function normaliseNulls(value: unknown): unknown {
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t.toLowerCase() === "null" ? null : value;
  }
  if (Array.isArray(value)) return value.map(normaliseNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseNulls(v)]));
  }
  return value;
}

function isKind(k: unknown): k is ItemKind {
  return typeof k === "string" && (ITEM_KINDS as readonly string[]).includes(k);
}

/** Check the shape of the model's answer and give every item a stable entity_id. */
export function toExtractionResult(raw: unknown): ExtractionResult {
  const obj = normaliseNulls(raw) as { items?: unknown } | null;
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.items)) {
    throw new Error('Model answer is missing the "items" array.');
  }

  const items: ExtractedItem[] = obj.items.map((it, i) => {
    const item = it as { kind?: unknown; data?: unknown };
    if (!isKind(item?.kind)) throw new Error(`Item ${i + 1} has an unknown kind: ${String(item?.kind)}`);
    if (!item.data || typeof item.data !== "object" || Array.isArray(item.data)) {
      throw new Error(`Item ${i + 1} (${item.kind}) has no data object.`);
    }
    return {
      entity_id: `${item.kind}_${randomUUID().slice(0, 8)}`,
      kind: item.kind,
      data: item.data as Record<string, unknown>,
    };
  });

  return { items };
}
