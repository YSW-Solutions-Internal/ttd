import { Modal } from "@/app/modal";
import { TripView } from "@/app/trips/[id]/trip-view";

export const dynamic = "force-dynamic";

export default async function TripModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Modal>
      <TripView id={id} />
    </Modal>
  );
}
