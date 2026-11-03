"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaveResult } from "@/lib/form-values";

/** Saves what changed on one check (autosave sends only those). RLS refuses Accountants. */
export async function saveCheck(tripId: string, key: string, fd: FormData): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: stored } = await supabase.from("trip_checks").select("done_at, done_by, note").eq("trip_id", tripId).eq("check_key", key).maybeSingle();
  const done = fd.has("done") ? fd.get("done") === "on" : !!stored?.done_at;
  // done_by has a database default of the current user, so it is always set here: kept when already ticked, empty when not.
  const row = {
    trip_id: tripId,
    check_key: key,
    note: fd.has("note") ? String(fd.get("note") ?? "").trim() || null : (stored?.note ?? null),
    done_at: done ? (stored?.done_at ?? new Date().toISOString()) : null,
    done_by: done ? (stored?.done_at ? stored.done_by : user.id) : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("trip_checks").upsert(row).select("done_at");
  if (error) return { error: `Could not save: ${error.message}` };
  if (!data || data.length === 0) return { error: "Could not save: not permitted." };
  revalidatePath("/", "layout");
  return {};
}
