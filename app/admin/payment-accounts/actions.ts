"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAction } from "@/lib/auth";

export type AccountFormState = { error?: string; notice?: string };

/** A card, Cash or (for the agency) a bank account, by nickname only: never a card number. */
export async function addPaymentAccount(clientId: string | null, _prev: AccountFormState, fd: FormData): Promise<AccountFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };
  const nickname = String(fd.get("nickname") ?? "").trim();
  const kind = String(fd.get("kind") ?? "");
  if (!nickname) return { error: "Give it a nickname." };
  if (/\d{4}.*\d{4}/.test(nickname)) return { error: "Nicknames only, never card or account numbers." };
  const supabase = await createClient();
  const { error } = await supabase.from("payment_accounts").insert({ client_id: clientId, kind, nickname });
  // 23505: the case-insensitive nickname index; 23514: a kind that does not fit the owner.
  if (error) return { error: error.code === "23505" ? "There is already an account with that nickname." : error.code === "23514" ? "Choose the kind." : error.message };
  revalidatePath("/", "layout");
  return { notice: "Added." };
}

/** Retired accounts keep their Payments and statements, but take no new Payments. */
export async function setRetired(id: string, retired: boolean): Promise<void> {
  const guard = await requireAdminAction();
  if (!guard.ok) throw new Error(guard.error);
  const supabase = await createClient();
  const { error } = await supabase.from("payment_accounts").update({ retired_at: retired ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
