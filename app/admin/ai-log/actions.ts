"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminAction } from "@/lib/auth";

/** One call's answer exactly as Claude returned it, loaded only when opened (they can be long). */
export async function loadAnswer(id: string): Promise<{ raw?: string | null; error?: string | null; failed?: string }> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { failed: guard.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_calls").select("raw_output, error").eq("id", id).maybeSingle();
  if (error || !data) return { failed: error?.message ?? "That call is no longer in the log." };
  return { raw: data.raw_output, error: data.error };
}
