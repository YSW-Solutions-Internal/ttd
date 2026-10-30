"use client";

import { useActionState } from "react";
import { renderVersionPdf, type PdfState } from "./pdf-actions";
import { Badge, Msg } from "@/app/ui";

export function RetryPdfButton({ quoteId, versionId }: { quoteId: string; versionId: string }) {
  const [state, action, running] = useActionState<PdfState, FormData>(
    renderVersionPdf.bind(null, quoteId, versionId),
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Badge tone="danger">PDF failed</Badge>
      <button type="submit" disabled={running} className="px-3 py-1">
        {running ? "Making PDF…" : "Retry"}
      </button>
      {state.error && <Msg tone="error">{state.error}</Msg>}
    </form>
  );
}
