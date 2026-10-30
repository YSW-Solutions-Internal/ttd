import Link from "next/link";
import { TripView } from "./trip-view";

export const dynamic = "force-dynamic";
// Extraction keeps reading after the response (after() in extract-actions.ts); 800 s is the Vercel Pro limit.
// Set wherever the Quote editor can be open: its actions run in the page under the Trip modal too.
export const maxDuration = 800;

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="mb-3">
        <Link href="/">All trips</Link>
      </p>
      <TripView id={id} />
    </main>
  );
}
