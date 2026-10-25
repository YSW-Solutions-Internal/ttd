"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StayFormState = { error?: string; notice?: string };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Adds a Stay to the Trip (no `stayId`) or saves one. RLS limits it to the
 * Trip's Consultant or an admin. Stays are shared by every Quote on the Trip.
 */
export async function saveStay(
  tripId: string,
  stayId: string | null,
  _prev: StayFormState,
  formData: FormData,
): Promise<StayFormState> {
  const code = text(formData, "destination_code");
  const starts = text(formData, "starts_on");
  const ends = text(formData, "ends_on");
  if (!code) return { error: "Choose a destination." };
  if ((starts && !isDate(starts)) || (ends && !isDate(ends))) return { error: "Dates must be full dates." };
  if (starts && ends && ends < starts) return { error: "The Stay cannot end before it starts." };

  const supabase = await createClient();
  const { data: dest } = await supabase.from("destinations").select("name").eq("code", code).maybeSingle();
  if (!dest) return { error: "Unknown destination." };

  const fields = {
    destination_code: code,
    destination: dest.name,
    starts_on: starts || null,
    ends_on: ends || null,
    highlight: text(formData, "highlight") || null,
  };

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
  return { notice: stayId ? "Saved." : "Added." };
}

/** Accommodation options placed in it become unplaced (on delete set null, migration 0010). */
export async function deleteStay(stayId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_stops").delete().eq("id", stayId);
  if (error) throw new Error(`Could not delete the Stay: ${error.message}`);
  revalidatePath("/", "layout");
}
