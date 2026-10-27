"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaveResult } from "@/lib/form-values";

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
