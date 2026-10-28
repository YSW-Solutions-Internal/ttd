"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaveResult } from "@/lib/form-values";

// Who may do what is decided by the database (migration 0022): every User but an
// Accountant edits Travellers; IDs and Passports only the Client's Consultant and
// Administrators; only Administrators delete either.

export type TravellerFormState = { error?: string; notice?: string };

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const TRAVELLER_TEXT = ["title", "email", "phone"];
const IDENTITY_TEXT = ["nationality", "name_as_printed"];
const DATES = ["date_of_birth", "issued_on", "expires_on"];
const IMAGE_EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** The fields sent (autosave sends only those that changed), checked. */
function fields(fd: FormData, required: string[], optional: string[]): Record<string, unknown> | SaveResult {
  const row: Record<string, unknown> = {};
  for (const key of required) {
    if (!fd.has(key)) continue;
    if (!text(fd, key)) return { error: "This cannot be empty.", field: key };
    row[key] = text(fd, key);
  }
  for (const key of optional) {
    if (!fd.has(key)) continue;
    if (DATES.includes(key) && text(fd, key) && !isDate(text(fd, key))) return { error: "Enter a full date.", field: key };
    row[key] = text(fd, key) || null;
  }
  return row;
}
const failed = (r: Record<string, unknown> | SaveResult): r is SaveResult => typeof (r as SaveResult).error === "string";

/** Stores an ID or passport image beside the Client's documents (client-files is private to the Consultant and admins). */
async function storeImage(clientId: string, file: FormDataEntryValue | null): Promise<{ path?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  if (!IMAGE_EXT[file.type]) return { error: "Only PDF, JPG or PNG images." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "The image is over 10 MB." };
  const supabase = await createClient();
  const path = `${clientId}/travellers/${crypto.randomUUID()}.${IMAGE_EXT[file.type]}`;
  const { error } = await supabase.storage.from("client-files").upload(path, file, { contentType: file.type, upsert: false });
  return error ? { error: `Could not upload the image: ${error.message}` } : { path };
}

/** Adds a Traveller to a Client, and to a Trip of that Client when `tripId` is given. */
export async function addTraveller(
  clientId: string,
  tripId: string | null,
  _prev: TravellerFormState,
  fd: FormData,
): Promise<TravellerFormState> {
  const row = fields(fd, ["first_name", "last_name"], [...TRAVELLER_TEXT, "date_of_birth"]);
  if (failed(row)) return { error: row.error };
  if (!row.first_name || !row.last_name) return { error: "Enter a first and last name." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("travellers").insert({ ...row, client_id: clientId }).select("id").single();
  if (error || !data) return { error: `Could not add the Traveller: ${error?.message ?? "unknown error"}` };
  if (tripId) {
    const { error: e } = await supabase.from("trip_travellers").insert({ trip_id: tripId, traveller_id: data.id });
    if (e) return { error: `Added to the Client, but not to this Trip: ${e.message}` };
  }
  revalidatePath("/", "layout");
  return { notice: `${row.first_name} ${row.last_name} added.` };
}

export async function saveTraveller(id: string, fd: FormData): Promise<SaveResult> {
  const row = fields(fd, ["first_name", "last_name"], [...TRAVELLER_TEXT, "date_of_birth"]);
  if (failed(row)) return row;
  const supabase = await createClient();
  const { data, error } = await supabase.from("travellers").update(row).eq("id", id).select("id");
  if (error) return { error: `Could not save: ${error.message}` };
  if (!data || data.length === 0) return { error: "Could not save: not permitted." };
  revalidatePath("/", "layout");
  return {};
}

export async function deleteTraveller(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("travellers").delete().eq("id", id);
  // 23503: still on a Trip (trip_travellers refuses the delete).
  if (error) throw new Error(error.code === "23503" ? "Take this Traveller off every Trip first." : `Could not delete: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function addToTrip(tripId: string, fd: FormData): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_travellers").insert({ trip_id: tripId, traveller_id: text(fd, "traveller_id") });
  if (error) throw new Error(`Could not add the Traveller: ${error.message}`);
  revalidatePath("/", "layout");
}

export async function removeFromTrip(tripId: string, travellerId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("trip_travellers").delete().eq("trip_id", tripId).eq("traveller_id", travellerId);
  if (error) throw new Error(`Could not remove the Traveller: ${error.message}`);
  revalidatePath("/", "layout");
}

/** Adds an ID or a Passport, with its image if one was chosen. */
export async function addIdentity(
  clientId: string,
  travellerId: string,
  _prev: TravellerFormState,
  fd: FormData,
): Promise<TravellerFormState> {
  const kind = text(fd, "kind") === "id" ? "id" : "passport";
  const row = fields(fd, ["number"], [...IDENTITY_TEXT, "issued_on", "expires_on"]);
  if (failed(row)) return { error: row.error };
  if (!row.number) return { error: "Enter the number." };
  if (kind === "passport" && (!row.nationality || !row.issued_on || !row.expires_on)) {
    return { error: "A Passport needs its nationality, issue date and expiry date." };
  }

  const image = await storeImage(clientId, fd.get("image"));
  if (image.error) return { error: image.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("identity_documents")
    .insert({ ...row, kind, traveller_id: travellerId, image_path: image.path ?? null });
  // 23505: the one-ID-per-Traveller index.
  // shortcut: an uploaded image is left behind if this fails (only admins delete files); clean up by hand if it happens.
  if (error) return { error: error.code === "23505" ? "This Traveller already has an ID; correct that one." : `Could not save: ${error.message}` };
  revalidatePath("/", "layout");
  return { notice: kind === "id" ? "ID added." : "Passport added." };
}

/** Corrects an ID or Passport; a renewed passport is added as a new one instead. */
export async function saveIdentity(id: string, fd: FormData): Promise<SaveResult> {
  const row = fields(fd, ["number"], [...IDENTITY_TEXT, "issued_on", "expires_on"]);
  if (failed(row)) return row;
  const supabase = await createClient();
  const { data, error } = await supabase.from("identity_documents").update(row).eq("id", id).select("id");
  // 23514: a Passport's nationality and dates cannot be emptied.
  if (error) return { error: error.code === "23514" ? "A Passport needs its nationality, issue and expiry dates." : `Could not save: ${error.message}` };
  if (!data || data.length === 0) return { error: "Could not save: not permitted." };
  revalidatePath("/", "layout");
  return {};
}

export async function setIdentityImage(
  clientId: string,
  id: string,
  _prev: TravellerFormState,
  fd: FormData,
): Promise<TravellerFormState> {
  const image = await storeImage(clientId, fd.get("image"));
  if (image.error) return { error: image.error };
  if (!image.path) return { error: "Choose an image." };
  const supabase = await createClient();
  const { error } = await supabase.from("identity_documents").update({ image_path: image.path }).eq("id", id);
  if (error) return { error: `Could not save the image: ${error.message}` };
  revalidatePath("/", "layout");
  return { notice: "Image saved." };
}

export async function deleteIdentity(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("identity_documents").delete().eq("id", id);
  if (error) throw new Error(`Could not delete: ${error.message}`);
  revalidatePath("/", "layout");
}
