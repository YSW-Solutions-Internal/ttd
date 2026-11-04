"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAction } from "@/lib/auth";
import { countryIn } from "@/lib/fees";

export type DestinationFormState = { error?: string; notice?: string };

/** Corrects a Destination's name and country; its Stays take the new name (Versions stay as generated). */
export async function correctDestination(_prev: DestinationFormState, fd: FormData): Promise<DestinationFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };
  const code = String(fd.get("code") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };
  const countryCode = countryIn(String(fd.get("country") ?? ""));
  if (!countryCode) return { error: "Choose a country from the list." };
  const country = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;

  const supabase = await createClient();
  const { data: twin } = await supabase
    .from("destinations")
    .select("code")
    .ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`)) // literal match, not a pattern
    .eq("country_code", countryCode)
    .neq("code", code)
    .limit(1)
    .maybeSingle();
  if (twin) return { error: `${twin.code} is already ${name}, ${country}. Merge into it instead.` };

  const { error } = await supabase.from("destinations").update({ name, country, country_code: countryCode }).eq("code", code);
  if (error) return { error: `Could not save: ${error.message}` };
  // shortcut: two statements, not one transaction; if this fails, saving again copies the name across.
  const { error: stayErr } = await supabase.from("trip_stops").update({ destination: name }).eq("destination_code", code);
  if (stayErr) return { error: `Saved, but could not rename its Stays: ${stayErr.message}` };
  revalidatePath("/", "layout");
  return { notice: "Saved." };
}

/** Removes a Destination no Stay uses. */
export async function removeDestination(_prev: DestinationFormState, fd: FormData): Promise<DestinationFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };
  const code = String(fd.get("code") ?? "");

  const supabase = await createClient();
  const { count } = await supabase.from("trip_stops").select("id", { count: "exact", head: true }).eq("destination_code", code);
  if (count) return { error: `${count} Stay${count === 1 ? " is" : "s are"} here. Merge it instead.` };
  const { error } = await supabase.from("destinations").delete().eq("code", code);
  if (error) return { error: `Could not remove: ${error.message}` };
  revalidatePath("/", "layout");
  return { notice: "Removed." };
}

/** Moves a duplicate's Stays to the Destination it duplicates, then removes the duplicate. */
export async function mergeDestination(_prev: DestinationFormState, fd: FormData): Promise<DestinationFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };
  const from = String(fd.get("code") ?? "");
  const into = String(fd.get("into") ?? "");
  if (!into || into === from) return { error: "Choose the Destination to merge into." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("destinations").select("name").eq("code", into).maybeSingle();
  if (!target) return { error: "That Destination no longer exists." };
  // shortcut: two statements, not one transaction; if the delete fails, the duplicate is left empty and can be merged again.
  const { error: moveErr } = await supabase
    .from("trip_stops")
    .update({ destination_code: into, destination: target.name })
    .eq("destination_code", from);
  if (moveErr) return { error: `Could not move the Stays: ${moveErr.message}` };
  const { error } = await supabase.from("destinations").delete().eq("code", from);
  if (error) return { error: `Moved the Stays, but could not remove the duplicate: ${error.message}` };
  revalidatePath("/", "layout");
  return { notice: "Merged." };
}
