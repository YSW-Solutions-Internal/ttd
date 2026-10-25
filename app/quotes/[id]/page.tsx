import { QuoteView } from "./quote-view";

export const dynamic = "force-dynamic";
// Extraction runs inside the request. Lower this to 60 if your Vercel plan rejects 300.
export const maxDuration = 300;

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="container">
      <QuoteView id={id} editable />
    </main>
  );
}
