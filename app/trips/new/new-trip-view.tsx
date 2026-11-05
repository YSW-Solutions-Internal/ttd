import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getProfile } from "@/lib/auth";
import { everyRow } from "@/lib/relations";
import { NewTripForm } from "./new-trip-form";

// Shared by the full New trip page and the New trip modal.
export async function NewTripView({ clientId }: { clientId?: string }) {
  const me = await getProfile();
  if (!me || !canEdit(me.role)) redirect("/");
  const supabase = await createClient();
  // Every User can start a Trip for any Client (ADR 0010).
  const clients = await everyRow((from, to) =>
    supabase.from("clients").select("id, client_code, full_name").eq("active", true).order("sort_name").order("id").range(from, to),
  );

  return (
    <>
      <h1>New trip</h1>
      <NewTripForm clients={clients} clientId={clientId} />
    </>
  );
}
