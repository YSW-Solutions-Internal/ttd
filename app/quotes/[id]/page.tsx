import { QuoteView } from "./quote-view";

export const dynamic = "force-dynamic";
// Extraction keeps reading after the response (after() in extract-actions.ts); 800 s is the Vercel Pro limit.
export const maxDuration = 800;

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="container">
      <QuoteView id={id} editable />
    </main>
  );
}
