"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { runExtraction, type ExtractState } from "./extract-actions";
import { Msg } from "@/app/ui";

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
    <form action={action} className="mt-3.5 flex flex-wrap items-center gap-3">
      <button type="submit" disabled={running || waiting === 0}>
        {running
          ? "Sending images…"
          : waiting === 0
            ? "All images extracted"
            : `Extract data (${waiting} new)`}
      </button>
      {reading > 0 && <Msg>Reading {reading} image{reading === 1 ? "" : "s"}…</Msg>}
      {state.message && <Msg>{state.message}</Msg>}
      {state.error && <Msg tone="error">{state.error}</Msg>}
    </form>
  );
}
