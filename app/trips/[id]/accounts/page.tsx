import { redirect } from "next/navigation";

/** Old links and bookmarks: a Trip's accounts are now its Accounts tab. */
export default async function TripAccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/trips/${id}#accounts`);
}
