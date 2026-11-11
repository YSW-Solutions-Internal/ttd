import { Modal } from "@/app/modal";

// The Trip modal opens at once; its content follows when the server has it.
export default function TripModalLoading() {
  return (
    <Modal>
      <p className="text-muted" role="status">Loading trip…</p>
    </Modal>
  );
}
