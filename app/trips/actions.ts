"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTripStatus } from "@/lib/trip-status";
import type { SaveResult } from "@/lib/form-values";

export type CreateTripState = { error?: string };

// References and the trip's consultant (the client's Consultant) are set by the
// database (migration 0007); RLS refuses Accountants (0021).
export async function createTrip(_prev: CreateTripState, formData: FormData): Promise<CreateTripState> {
  const clientId = String(formData.get("client_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  if (!clientId) return { error: "Choose a client." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("trips")
    .insert({ client_id: clientId, title, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: `Could not create the trip: ${error?.message ?? "unknown error"}` };
  // Replace, so Back from the new Trip returns to the list rather than the empty form.
  redirect(`/trips/${data.id}`, RedirectType.replace);
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const TEXT_FIELDS = ["title", "visa_info", "health_info", "insurance_info", "custom_notes", "ta_number", "cost_centre", "authorising_person"];

/**
 * Saves the Trip details that changed (autosave sends only those) and sends back Nights.
 * RLS refuses Accountants; any status may follow any other.
 */
export async function saveTrip(tripId: string, formData: FormData): Promise<SaveResult> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const row: Record<string, unknown> = {};

  if (formData.has("status")) {
    const status = formData.get("status");
    if (!isTripStatus(status)) return { error: "Unknown trip status.", field: "status" };
    row.status = status;
  }
  for (const key of ["starts_on", "ends_on"]) {
    if (!formData.has(key)) continue;
    if (text(key) && !isDate(text(key))) return { error: "Dates must be full dates.", field: key };
    row[key] = text(key) || null;
  }
  for (const key of ["adults", "children"]) {
    if (!formData.has(key)) continue;
    const n = Number(text(key));
    if (text(key) === "" || !Number.isInteger(n) || n < 0) return { error: "Adults and children must be whole numbers, 0 or more.", field: key };
    row[key] = n;
  }
  for (const key of TEXT_FIELDS) if (formData.has(key)) row[key] = text(key) || null;

  const supabase = await createClient();
  if ("starts_on" in row || "ends_on" in row) {
    const { data: stored } = await supabase.from("trips").select("starts_on, ends_on").eq("id", tripId).maybeSingle();
    const starts = "starts_on" in row ? row.starts_on : stored?.starts_on;
    const ends = "ends_on" in row ? row.ends_on : stored?.ends_on;
    if (starts && ends && String(ends) < String(starts)) {
      return { error: "The Trip cannot end before it starts.", field: "ends_on" in row ? "ends_on" : "starts_on" };
    }
  }

  const { data, error } = await supabase.from("trips").update(row).eq("id", tripId).select("id, nights");
  if (error) return { error: `Could not save: ${error.message}` };
  if (!data || data.length === 0) return { error: "Could not save: not permitted." };
  revalidatePath("/", "layout");
  return { values: { nights: data[0].nights == null ? "—" : String(data[0].nights) } };
}
