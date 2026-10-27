"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { applyFees, autoRegion, FEE_FIELDS, FEE_REGIONS, VARIANTS } from "@/lib/fees";
import { countriesOf, loadFeeContext, loadPlaces } from "@/lib/fee-context";
import { fillFlightNames } from "@/lib/codes";
import { parseAmount } from "@/lib/form-values";
import { FLIGHT_FIELDS, ITEM_FIELDS, PRICE_FIELDS, type Field } from "./item-fields";

export type ItemFormState = { error?: string; notice?: string };

function isTable(t: string): t is ItemTable {
  return Object.hasOwn(TABLE_KIND, t);
}

/** One submitted value, typed by its field. Throws a message for the Consultant on a bad number. */
function parse(field: Field, raw: unknown): unknown {
  if (field.type === "checkbox") return raw === "on" || raw === true;
  const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
  if (field.type === "money") return parseAmount(s, field.label);
  if (s === "") return null;
  if (field.type === "number") {
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
    return n;
  }
  return s;
}

/** The flights list the form sends as JSON, keeping only known columns. */
function parseFlights(json: string): Record<string, unknown>[] {
  const list: unknown = JSON.parse(json || "[]");
  if (!Array.isArray(list)) throw new Error("The flights could not be read.");
  return list.map((f: Record<string, unknown>) => {
    const row: Record<string, unknown> = {};
    for (const field of FLIGHT_FIELDS) row[field.name] = parse(field, f[field.name]);
    if (typeof row.direction_no !== "number" || typeof row.seq !== "number") {
      throw new Error("Every flight needs a direction and a position number.");
    }
    return row;
  });
}

export async function saveItem(
  quoteId: string,
  table: string,
  id: string,
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  if (!isTable(table)) return { error: "Unknown kind of Item." };
  const kind = TABLE_KIND[table];
  const supabase = await createClient();

  const { data: prev } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!prev) return { error: "This Item no longer exists, or you cannot edit it." };

  let row: Record<string, unknown>;
  let flights: Record<string, unknown>[] = [];
  try {
    row = {};
    for (const field of [...ITEM_FIELDS[table], ...PRICE_FIELDS]) row[field.name] = parse(field, formData.get(field.name));
    for (const f of FEE_FIELDS) row[f] = parse({ name: f, label: "Each fee", type: "money" }, formData.get(f));
    if (kind === "flight") flights = parseFlights(String(formData.get("flights") ?? "[]"));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the form." };
  }

  const region = String(formData.get("fee_region") ?? "");
  const variant = String(formData.get("variant") ?? "");
  row.fee_region = (FEE_REGIONS as readonly string[]).includes(region) ? region : null;
  row.variant = kind === "flight" && (VARIANTS as readonly string[]).includes(variant) ? variant : "";
  row.markup ??= 0;
  if (table === "accommodation_options") {
    row.rooms ??= 1;
    row.stay_id = String(formData.get("stay_id") ?? "") || null;
  }
  if (table === "car_rentals") row.ten_percent_fee = formData.get("ten_percent_fee") === "on";

  const ctx = await loadFeeContext(supabase, quoteId);
  const places = await loadPlaces(supabase, flights.flatMap((f) => [f.from_code, f.to_code]));
  for (const f of flights) fillFlightNames(f, places);
  applyFees(kind, row, prev, autoRegion(kind, row, flights, ctx.stays, countriesOf(places)), ctx.rates);

  const { data, error } = await supabase.from(table).update(row).eq("id", id).select("id");
  if (error) return { error: `Could not save: ${error.message}` };
  // RLS filters rather than errors, so zero rows means the update was refused.
  if (!data || data.length === 0) return { error: "Could not save: only the client's consultant or an administrator can edit." };

  if (kind === "flight") {
    const { error: flErr } = await supabase.rpc("replace_flights", { p_option_id: id, p_flights: flights });
    if (flErr) return { error: `Saved the option, but not its flights: ${flErr.message}` };
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { notice: "Saved." };
}

/** A hand-entered Item: a row with no image (ADR 0005). */
export async function addItem(quoteId: string, formData: FormData): Promise<void> {
  const table = String(formData.get("table") ?? "");
  if (!isTable(table)) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { error } = await supabase.from(table).insert({
    quote_id: quoteId,
    entity_id: `${TABLE_KIND[table]}_${randomUUID().slice(0, 8)}`,
  });
  if (error) throw new Error(`Could not add the Item: ${error.message}`);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function deleteItem(quoteId: string, table: string, id: string): Promise<void> {
  if (!isTable(table)) return;
  const supabase = await createClient();
  // Flights go with their option (on delete cascade). The AI's reading stays in ai_calls.
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(`Could not delete the Item: ${error.message}`);
  revalidatePath(`/quotes/${quoteId}`);
}

/** A Consultant confirms or corrects an airline's name once, for everyone (migration 0012). */
export async function confirmAirline(quoteId: string, formData: FormData): Promise<void> {
  const iata = String(formData.get("iata") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[A-Z0-9]{2}$/.test(iata) || !name) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { error } = await supabase
    .from("airlines")
    .upsert({ iata, name, confirmed: true, confirmed_by: auth.user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save the airline: ${error.message}`);
  revalidatePath(`/quotes/${quoteId}`);
}
