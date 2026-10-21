"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Sign-in failed:", error.code, error.status, error.message);
    const known: Record<string, string> = {
      invalid_credentials: "Wrong email or password, or this user has no password yet.",
      email_not_confirmed: "This email is not confirmed yet. Confirm the user in Supabase (Authentication, Users).",
      user_banned: "This user is blocked.",
    };
    const reason = (error.code && known[error.code]) || error.message;
    return { error: `Could not sign in: ${reason}` };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}