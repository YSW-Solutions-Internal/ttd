import { Modal } from "@/app/modal";
import { NewTripView } from "@/app/trips/new/new-trip-view";

export const dynamic = "force-dynamic";

export default async function NewTripModal({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  return (
    <Modal>
      <NewTripView clientId={client} />
    </Modal>
  );
}
