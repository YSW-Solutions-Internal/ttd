"use client";

import { useActionState, useState, startTransition } from "react";
import { useSaves } from "@/app/autosave";
import { generateVersion, type PdfState } from "./pdf-actions";
import { Msg } from "@/app/ui";

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
    <form onSubmit={submit} className="mb-3.5 flex flex-col items-start gap-2.5">
      <button type="submit" disabled={running || saving}>
        {saving ? "Saving…" : running ? "Generating…" : "Generate version"}
      </button>
      {unsaved.length > 0 && (
        <Msg tone="error">Couldn&apos;t save these, so nothing was generated: {unsaved.join(", ")}</Msg>
      )}
      {state.problems && (
        <Msg tone="error">
          Fix these first:
          <ul className="mt-1 list-disc pl-5">
            {state.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Msg>
      )}
      {state.error && <Msg tone="error">{state.error}</Msg>}
    </form>
  );
}
