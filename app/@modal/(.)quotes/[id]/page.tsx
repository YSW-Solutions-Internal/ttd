import { Modal } from "@/app/modal";
import { QuoteView } from "@/app/quotes/[id]/quote-view";

export const dynamic = "force-dynamic";
// Extraction keeps reading after the response, which may come from this intercepted route.
export const maxDuration = 800;

export default async function QuoteModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Modal>
      <QuoteView id={id} />
    </Modal>
  );
}
