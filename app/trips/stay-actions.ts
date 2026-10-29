"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaveResult } from "@/lib/form-values";
import { countryIn } from "@/lib/fees";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Adds a Stay to the Trip (no `stayId`; needs a destination) or saves the fields of
 * one that changed (autosave sends only those). RLS limits it to the Trip's
 * Consultant or an admin.
 */
export async function saveStay(tripId: string, stayId: string | null, formData: FormData): Promise<SaveResult> {
  const supabase = await createClient();
  const fields: Record<string, unknown> = {};

  if (formData.has("destination_code") || !stayId) {
    const code = text(formData, "destination_code");
    if (!code) return { error: "Choose a destination.", field: "destination_code" };
    const { data: dest } = await supabase.from("destinations").select("name").eq("code", code).maybeSingle();
    if (!dest) return { error: "Unknown destination.", field: "destination_code" };
    fields.destination_code = code;
    fields.destination = dest.name;
  }
  for (const key of ["starts_on", "ends_on"]) {
    if (!formData.has(key)) continue;
    if (text(formData, key) && !isDate(text(formData, key))) return { error: "Dates must be full dates.", field: key };
    fields[key] = text(formData, key) || null;
  }
  if (formData.has("highlight")) fields.highlight = text(formData, "highlight") || null;

  let stored: { starts_on: string | null; ends_on: string | null } | null = null;
  if (stayId && ("starts_on" in fields || "ends_on" in fields)) {
    ({ data: stored } = await supabase.from("trip_stops").select("starts_on, ends_on").eq("id", stayId).maybeSingle());
  }
  const starts = "starts_on" in fields ? fields.starts_on : stored?.starts_on;
  const ends = "ends_on" in fields ? fields.ends_on : stored?.ends_on;
  if (starts && ends && String(ends) < String(starts)) {
    return { error: "The Stay cannot end before it starts.", field: "ends_on" in fields ? "ends_on" : "starts_on" };
  }

  if (stayId) {
    const { data, error } = await supabase.from("trip_stops").update(fields).eq("id", stayId).select("id");
    if (error) return { error: `Could not save: ${error.message}` };
    if (!data || data.length === 0) return { error: "Could not save: only the trip's consultant or an administrator can edit." };
  } else {
    const { data: last } = await supabase
      .from("trip_stops")
      .select("position")
      .eq("trip_id", tripId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("trip_stops")
      .insert({ ...fields, trip_id: tripId, position: (last?.position ?? 0) + 1 });
    if (error) return { error: `Could not add the Stay: ${error.message}` };
  }

  // Quote pages use the Stays too (Stay dropdown, Fee region).
  revalidatePath("/", "layout");
  return {};
}

/** Accommodation options placed in it become unplaced (on delete set null, migration 0010). */
export async function deleteStay(stayId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_stops").delete().eq("id", stayId);
  if (error) throw new Error(`Could not delete the Stay: ${error.message}`);
  revalidatePath("/", "layout");
}

export type CityGuess = { country: string; code: string };

/** A new Destination's country and code, from the airports table's city of that name. */
export async function guessCity(name: string): Promise<CityGuess | null> {
  const city = name.trim().replace(/[\\%_]/g, (c) => `\\${c}`); // literal match, not a pattern
  if (!city) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("airports")
    .select("iata, city_code, country")
    .ilike("city", city)
    .order("city_code", { nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data ? { country: data.country ?? "", code: data.city_code ?? data.iata } : null;
}

export type AddDestinationResult = { error?: string; code?: string; label?: string };

/**
 * Adds a Destination for everyone (any User may, migration 0020). The country is required,
 * since the Fee region comes from it; a place with no airport gets a code made from its name.
 */
export async function addDestination(formData: FormData): Promise<AddDestinationResult> {
  const name = text(formData, "name");
  if (!name) return { error: "Give the destination a name." };
  const countryCode = countryIn(text(formData, "country"));
  if (!countryCode) return { error: "Choose a country from the list." };
  const country = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;

  const supabase = await createClient();
  const given = text(formData, "code").toUpperCase();
  if (given && !/^[A-Z0-9]{2,12}$/.test(given)) return { error: "The code is letters and digits only, up to 12." };

  // A made-up code steps past any already taken: SABISAND, SABISAND2 ...
  const base = given || name.normalize("NFD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "PLACE";
  for (let n = 1; n < 100; n++) {
    const code = n === 1 ? base : `${base}${n}`;
    const { error } = await supabase.from("destinations").insert({ code, name, country, country_code: countryCode });
    if (!error) {
      revalidatePath("/", "layout");
      return { code, label: `${name}, ${country}` };
    }
    if (error.code !== "23505") return { error: `Could not add the destination: ${error.message}` };
    if (given) {
      const { data: taken } = await supabase.from("destinations").select("name, country").eq("code", given).maybeSingle();
      return { error: `${given} is already ${taken ? `${taken.name}, ${taken.country}` : "taken"}.` };
    }
  }
  return { error: "Could not find a free code; enter one." };
}
