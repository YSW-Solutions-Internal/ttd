"use client";

import { useActionState } from "react";
import { renderVersionPdf, type PdfState } from "./pdf-actions";

export function RetryPdfButton({ quoteId, versionId }: { quoteId: string; versionId: string }) {
  const [state, action, running] = useActionState<PdfState, FormData>(
    renderVersionPdf.bind(null, quoteId, versionId),
    {},
  );

  return (
    <form action={action}>
      <span className="badge bad">PDF failed</span>{" "}
      <button type="submit" disabled={running}>
        {running ? "Making PDF…" : "Retry"}
      </button>
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
