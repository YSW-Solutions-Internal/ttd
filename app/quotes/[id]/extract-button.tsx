"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { runExtraction, type ExtractState } from "./extract-actions";

export function ExtractButton({
  quoteId,
  pending: waiting,
  reading,
}: {
  quoteId: string;
  pending: number;
  reading: number;
}) {
  const [state, action, running] = useActionState<ExtractState, FormData>(
    runExtraction.bind(null, quoteId),
    {},
  );
  const router = useRouter();

  // Reading happens in the background: fetch the latest page data every 5 s until it is done.
  useEffect(() => {
    if (reading === 0) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [reading, router]);

  return (
    <form action={action} style={{ marginTop: 14 }}>
      <button type="submit" disabled={running || waiting === 0}>
        {running
          ? "Sending images…"
          : waiting === 0
            ? "All images extracted"
            : `Extract data (${waiting} new)`}
      </button>
      {reading > 0 && <div className="msg">Reading {reading} image{reading === 1 ? "" : "s"}…</div>}
      {state.message && <div className="msg">{state.message}</div>}
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
