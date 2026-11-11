import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getProfile } from "@/lib/auth";
import { ClientForm } from "../client-forms";

export const dynamic = "force-dynamic";

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getProfile();
  if (!me) redirect("/login");
  if (!canEdit(me.role)) redirect("/clients");

  // Admins choose the Consultant; everyone else becomes it.
  let consultants: { id: string; label: string }[] | undefined;
  if (me.role === "admin") {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("role", ["user", "admin"]).order("full_name");
    consultants = (data ?? []).map((p) => ({ id: p.id, label: p.full_name ?? p.email }));
  }

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="mb-3">
        <Link href={next === "trip" ? "/trips/new" : "/clients"}>Back</Link>
      </p>
      <h1>Add client</h1>
      <p className="mb-4 text-muted">The client code is made from the name when you save, and never changes.</p>
      <ClientForm consultants={consultants} defaultConsultantId={me.id} next={next === "trip" ? "trip" : undefined} />
    </main>
  );
}
