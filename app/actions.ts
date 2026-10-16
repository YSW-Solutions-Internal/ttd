"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateQuoteState = { error?: string };

export async function createQuote(
  _prev: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const title = String(formData.get("title") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  if (!title) return { error: "Give the quote a title." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("quotes")
    .insert({ title, client_name: clientName || null, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not create the quote. Try again." };
  redirect(`/quotes/${data.id}`);
}
