import { Modal } from "@/app/modal";
import { QuoteView } from "@/app/quotes/[id]/quote-view";

export const dynamic = "force-dynamic";
// Extraction runs inside the request, which may be this intercepted route.
export const maxDuration = 300;

export default async function QuoteModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Modal>
      <QuoteView id={id} />
    </Modal>
  );
}
