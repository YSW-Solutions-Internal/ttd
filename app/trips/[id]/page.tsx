import Link from "next/link";
import { TripView } from "./trip-view";

export const dynamic = "force-dynamic";

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
