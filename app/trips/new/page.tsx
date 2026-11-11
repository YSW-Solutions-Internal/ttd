import Link from "next/link";
import { NewTripView } from "./new-trip-view";

export const dynamic = "force-dynamic";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="mb-4 text-muted">
        <Link href="/">← All trips</Link>
      </p>
      <NewTripView clientId={client} />
    </main>
  );
}
