"use client";

import { useActionState, useState, startTransition } from "react";
import { useSaves } from "@/app/autosave";
import { generateVersion, type PdfState } from "./pdf-actions";

/** Saves every change on screen first; generates nothing if one could not be saved. */
export function GenerateVersionButton({ quoteId }: { quoteId: string }) {
  const [state, action, running] = useActionState<PdfState, FormData>(generateVersion.bind(null, quoteId), {});
  const { waitForSaves } = useSaves();
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const failed = await waitForSaves();
    setSaving(false);
    setUnsaved(failed);
    if (failed.length === 0) startTransition(() => action(new FormData()));
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 14 }}>
      <button type="submit" disabled={running || saving}>
        {saving ? "Saving…" : running ? "Generating…" : "Generate version"}
      </button>
      {unsaved.length > 0 && (
        <div className="msg error">Couldn&apos;t save these, so nothing was generated: {unsaved.join(", ")}</div>
      )}
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
