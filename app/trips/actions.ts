"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTripStatus } from "@/lib/trip-status";

export type CreateTripState = { error?: string };

// References and the trip's consultant (the client's Consultant) are set by the
// database (migration 0007); RLS refuses clients you are not the Consultant for.
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

export type TripFormState = { error?: string; notice?: string };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Saves the Trip's own details. RLS limits it to the Trip's Consultant or an admin; any status may follow any other. */
export async function saveTrip(tripId: string, _prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const status = formData.get("status");
  if (!isTripStatus(status)) return { error: "Unknown trip status." };
  const starts = text("starts_on");
  const ends = text("ends_on");
  if ((starts && !isDate(starts)) || (ends && !isDate(ends))) return { error: "Dates must be full dates." };
  if (starts && ends && ends < starts) return { error: "The Trip cannot end before it starts." };
  const adults = Number(text("adults"));
  const children = Number(text("children"));
  if (!Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) {
    return { error: "Adults and children must be whole numbers, 0 or more." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .update({
      status,
      title: text("title") || null,
      starts_on: starts || null,
      ends_on: ends || null,
      adults,
      children,
      visa_info: text("visa_info") || null,
      health_info: text("health_info") || null,
      insurance_info: text("insurance_info") || null,
      custom_notes: text("custom_notes") || null,
    })
    .eq("id", tripId)
    .select("id");
  if (error) return { error: `Could not save: ${error.message}` };
  if (!data || data.length === 0) return { error: "Could not save: only the trip's consultant or an administrator can edit." };
  revalidatePath("/", "layout");
  return { notice: "Saved." };
}
