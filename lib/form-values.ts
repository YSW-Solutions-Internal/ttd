// Reading autosaved form fields on the server. Only the fields that changed are sent.

/** What an autosave action returns: an error (and the field it is about), or values the server filled in. */
export type SaveResult = { error?: string; field?: string; values?: Record<string, string> };

export type FormField = { name: string; label: string; type: string };

export class FieldParseError extends Error {
  readonly field: string;
  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

/** A Rand amount: digits, an optional minus and at most 2 decimals ("," accepted as the point). Empty is null. */
export function parseAmount(raw: string, label: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(s)) {
    throw new Error(`${label} must be an amount in Rand with at most 2 decimals.`);
  }
  return Number(s);
}

/** One submitted value, typed by its field. Throws a message for the Consultant on a bad number. */
export function parseField(field: FormField, raw: FormDataEntryValue | null): unknown {
  if (field.type === "checkbox") return raw === "on";
  const s = typeof raw === "string" ? raw.trim() : "";
  if (field.type === "money") return parseAmount(s, field.label);
  if (s === "") return null;
  if (field.type === "number") {
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
    return n;
  }
  return s;
}

/** The fields present in `formData`, parsed. A bad value throws a FieldParseError naming its field. */
export function parseChanged(fields: FormField[], formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!formData.has(field.name)) continue;
    try {
      out[field.name] = parseField(field, formData.get(field.name));
    } catch (e) {
      throw new FieldParseError(e instanceof Error ? e.message : "Could not read this value.", field.name);
    }
  }
  return out;
}
