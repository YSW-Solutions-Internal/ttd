import Link from "next/link";
import { TripView } from "./trip-view";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="container">
      <p className="sub">
        <Link href="/">← All trips</Link>
      </p>
      <TripView id={id} />
    </main>
  );
}
