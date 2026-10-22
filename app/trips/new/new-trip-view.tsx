import { createClient } from "@/lib/supabase/server";
import { NewTripForm } from "./new-trip-form";

// Shared by the full New trip page and the New trip modal.
export async function NewTripView({ clientId }: { clientId?: string }) {
  const supabase = await createClient();
  // RLS (0007): your own clients, or all of them for an admin.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, client_code, full_name")
    .eq("active", true)
    .order("last_name")
    .order("first_name");

  return (
    <>
      <h1>New trip</h1>
      <NewTripForm clients={clients ?? []} clientId={clientId} />
    </>
  );
}
