import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewTripForm } from "./new-trip-form";

export const dynamic = "force-dynamic";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const supabase = await createClient();
  // RLS (0007): your own clients, or all of them for an admin.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, client_code, full_name")
    .eq("active", true)
    .order("last_name")
    .order("first_name");

  return (
    <main className="container">
      <p className="sub">
        <Link href="/">← All trips</Link>
      </p>
      <h1>New trip</h1>
      <NewTripForm clients={clients ?? []} clientId={client} />
    </main>
  );
}
