import Link from "next/link";
import { NewTripView } from "./new-trip-view";

export const dynamic = "force-dynamic";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  return (
    <main className="container">
      <p className="sub">
        <Link href="/">← All trips</Link>
      </p>
      <NewTripView clientId={client} />
    </main>
  );
}
