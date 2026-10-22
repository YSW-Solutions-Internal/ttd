"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotState = { error?: string; notice?: string };

/**
 * Emails a password reset link. The reply is the same whether or not the
 * account exists, so this cannot be used to find out who has an account.
 * The link itself comes from the Reset password template (see /auth/confirm).
 */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error("Password reset request failed:", error.code, error.status, error.message);

  return { notice: "If that email has an account, we've sent a reset link. Check your inbox." };
}
