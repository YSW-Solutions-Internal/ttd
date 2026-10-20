"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateQuoteState = { error?: string };

// Picks or creates the client, creates the trip and the quote in one database call
// (start_quote in migration 0002). References are generated there, never here.
export async function createQuote(
  _prev: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const clientId = String(formData.get("client_id") ?? "").trim();
  const newClientName = String(formData.get("new_client_name") ?? "").trim();
  const tripTitle = String(formData.get("trip_title") ?? "").trim();

  if (!clientId && !newClientName) return { error: "Choose a client or enter a new client name." };
  if (clientId && newClientName) return { error: "Choose an existing client or enter a new name, not both." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("start_quote", {
    p_client_id: clientId || null,
    p_new_client_name: newClientName || null,
    p_trip_title: tripTitle || null,
  });

  if (error || !data) return { error: `Could not create the quote: ${error?.message ?? "unknown error"}` };
  redirect(`/quotes/${data}`);
}
