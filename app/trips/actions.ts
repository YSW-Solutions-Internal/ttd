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

export async function createQuote(tripId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("quotes")
    .insert({ trip_id: tripId, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create the quote: ${error?.message ?? "unknown error"}`);
  redirect(`/quotes/${data.id}`);
}

// RLS limits the update to the trip's Consultant or an admin; any status may follow any other.
export async function setTripStatus(tripId: string, formData: FormData) {
  const status = formData.get("status");
  if (!isTripStatus(status)) throw new Error("Unknown trip status.");

  const supabase = await createClient();
  const { error } = await supabase.from("trips").update({ status }).eq("id", tripId);
  if (error) throw new Error(`Could not change the status: ${error.message}`);
  revalidatePath("/", "layout");
}
