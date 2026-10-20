"use client";

import { useActionState } from "react";
import { runExtraction, type ExtractState } from "./extract-actions";

export function ExtractButton({ quoteId, pending: waiting }: { quoteId: string; pending: number }) {
  const [state, action, running] = useActionState<ExtractState, FormData>(
    runExtraction.bind(null, quoteId),
    {},
  );

  return (
    <form action={action} style={{ marginTop: 14 }}>
      <button type="submit" disabled={running || waiting === 0}>
        {running
          ? "Reading images with AI… this can take a minute"
          : waiting === 0
            ? "All images extracted"
            : `Extract data (${waiting} new)`}
      </button>
      {state.message && <div className="msg">{state.message}</div>}
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
