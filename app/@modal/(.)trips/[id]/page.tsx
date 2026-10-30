import { Modal } from "@/app/modal";
import { TripView } from "@/app/trips/[id]/trip-view";

export const dynamic = "force-dynamic";
// Extraction keeps reading after the response (after() in extract-actions.ts); 800 s is the Vercel Pro limit.
// Set wherever the Quote editor can be open: its actions run in the page under the Trip modal too.
export const maxDuration = 800;

export default async function TripModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Modal>
      <TripView id={id} />
    </Modal>
  );
}
