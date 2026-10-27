"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { applyFees, autoRegion, FEE_FIELDS, FEE_REGIONS, VARIANTS } from "@/lib/fees";
import { countriesOf, loadFeeContext, loadPlaces } from "@/lib/fee-context";
import { fillFlightNames } from "@/lib/codes";
import { FieldParseError, parseChanged, type SaveResult } from "@/lib/form-values";
import { FEE_LABELS, FLIGHT_FIELDS, ITEM_FIELDS, PRICE_FIELDS, type Field } from "./item-fields";

/** The four fees, read as Rand amounts. */
const FEE_INPUTS: Field[] = FEE_LABELS.map(([name, label]) => ({ name, label, type: "money" }));

function isTable(t: string): t is ItemTable {
  return Object.hasOwn(TABLE_KIND, t);
}

/** One flight value from the flights JSON, typed by its field. Throws a message for the Consultant on a bad number. */
function parse(field: Field, raw: unknown): unknown {
  if (field.type === "checkbox") return raw === "on" || raw === true;
  const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
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

/**
 * Saves the fields of one Item that changed (autosave sends only those). Fee region and
 * fees are worked out from the whole Item as stored plus the changes, and sent back.
 */
export async function saveItem(quoteId: string, table: string, id: string, formData: FormData): Promise<SaveResult> {
  if (!isTable(table)) return { error: "Unknown kind of Item." };
  const kind = TABLE_KIND[table];
  const supabase = await createClient();

  const { data: prev } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!prev) return { error: "This Item no longer exists, or you cannot edit it." };

  let changed: Record<string, unknown>;
  let flights: Record<string, unknown>[] | null = null;
  try {
    changed = parseChanged([...ITEM_FIELDS[table], ...PRICE_FIELDS, ...FEE_INPUTS], formData);
    if (kind === "flight" && formData.has("flights")) {
      try {
        flights = parseFlights(String(formData.get("flights")));
      } catch (e) {
        throw new FieldParseError(e instanceof Error ? e.message : "The flights could not be read.", "flights");
      }
    }
  } catch (e) {
    if (e instanceof FieldParseError) return { error: e.message, field: e.field };
    return { error: "Could not read the form." };
  }

  if (formData.has("fee_region")) {
    const region = String(formData.get("fee_region"));
    changed.fee_region = (FEE_REGIONS as readonly string[]).includes(region) ? region : null;
    // A region the Consultant picks stays; "Work it out" hands it back to the code.
    changed.fee_region_auto = !changed.fee_region;
  }
  if (formData.has("variant")) {
    const variant = String(formData.get("variant"));
    changed.variant = kind === "flight" && (VARIANTS as readonly string[]).includes(variant) ? variant : "";
    // Working the region out again would also reset the fare type just picked.
    changed.fee_region_auto = false;
  }
  if (formData.has("markup")) changed.markup ??= 0;
  if (table === "accommodation_options") {
    if (formData.has("rooms")) changed.rooms ??= 1;
    if (formData.has("stay_id")) changed.stay_id = String(formData.get("stay_id")) || null;
  }
  if (table === "car_rentals" && formData.has("ten_percent_fee")) changed.ten_percent_fee = formData.get("ten_percent_fee") === "on";

  // The region is worked out from the flights, so unsent flights come from the database.
  let routeFlights = flights ?? [];
  if (kind === "flight" && !flights) {
    const { data } = await supabase.from("flights").select("*").eq("flight_option_id", id);
    routeFlights = data ?? [];
  }

  const merged: Record<string, unknown> = { ...prev, ...changed };
  const ctx = await loadFeeContext(supabase, quoteId);
  const places = await loadPlaces(supabase, routeFlights.flatMap((f) => [f.from_code, f.to_code]));
  if (flights) for (const f of flights) fillFlightNames(f, places);
  applyFees(kind, merged, prev, autoRegion(kind, merged, routeFlights, ctx.stays, countriesOf(places)), ctx.rates);

  const computed = ["fee_region", "variant", "fee_region_auto", ...FEE_FIELDS];
  const row = Object.fromEntries([...Object.keys(changed), ...computed].map((k) => [k, merged[k]]));
  const { data, error } = await supabase.from(table).update(row).eq("id", id).select("id");
  if (error) return { error: `Could not save: ${error.message}` };
  // RLS filters rather than errors, so zero rows means the update was refused.
  if (!data || data.length === 0) return { error: "Could not save: only the client's consultant or an administrator can edit." };

  if (flights) {
    const { error: flErr } = await supabase.rpc("replace_flights", { p_option_id: id, p_flights: flights });
    if (flErr) return { error: `Saved the option, but not its flights: ${flErr.message}`, field: "flights" };
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { values: Object.fromEntries(computed.map((k) => [k, merged[k] == null ? "" : String(merged[k])])) };
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
