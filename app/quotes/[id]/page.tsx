import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The Quote now lives on its Trip's page; old links and bookmarks land on its section there.
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes").select("trip_id").eq("id", id).maybeSingle();
  if (!quote) notFound();
  redirect(`/trips/${quote.trip_id}#quote`);
}
