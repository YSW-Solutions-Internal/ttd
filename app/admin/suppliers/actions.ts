"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAction } from "@/lib/auth";

export type SupplierFormState = { error?: string; notice?: string };

/** Corrects a Supplier's name everywhere it is used: bookings point at the Supplier, not its name. */
export async function renameSupplier(_prev: SupplierFormState, fd: FormData): Promise<SupplierFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update({ name }).eq("id", id);
  // 23505: the case-insensitive unique name index.
  if (error) return { error: error.code === "23505" ? "Another Supplier already has that name. Merge into it instead." : `Could not rename: ${error.message}` };
  revalidatePath("/", "layout");
  return { notice: "Renamed." };
}

/** Moves a duplicate's bookings to the Supplier it duplicates, then removes the duplicate. */
export async function mergeSupplier(_prev: SupplierFormState, fd: FormData): Promise<SupplierFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };
  const from = String(fd.get("id") ?? "");
  const into = String(fd.get("into") ?? "");
  if (!into || into === from) return { error: "Choose the Supplier to merge into." };

  const supabase = await createClient();
  // shortcut: two statements, not one transaction; if the delete fails, the duplicate is left empty and can be merged again.
  const { error: moveErr } = await supabase.from("item_bookings").update({ supplier_id: into }).eq("supplier_id", from);
  if (moveErr) return { error: `Could not move the bookings: ${moveErr.message}` };
  const { error } = await supabase.from("suppliers").delete().eq("id", from);
  if (error) return { error: `Moved the bookings, but could not remove the duplicate: ${error.message}` };
  revalidatePath("/", "layout");
  return { notice: "Merged." };
}
