"use client";

import { useActionState } from "react";
import { generateVersion, type PdfState } from "./pdf-actions";

export function GenerateVersionButton({ quoteId }: { quoteId: string }) {
  const [state, action, running] = useActionState<PdfState, FormData>(generateVersion.bind(null, quoteId), {});

  return (
    <form action={action} style={{ marginBottom: 14 }}>
      <button type="submit" disabled={running}>
        {running ? "Generating…" : "Generate version"}
      </button>
      {state.problems && (
        <div className="msg error">
          Fix these first:
          <ul>
            {state.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
