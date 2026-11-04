"use client";

import { useRef, useState, useTransition } from "react";
import { loadAnswer } from "./actions";
import { Button, Msg } from "@/app/ui";

/** Pretty-printed when it is JSON, else as returned (an answer that would not parse is the interesting one). */
function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Opens one call's raw answer, and its error if any, in a modal. */
export function AnswerButton({ id }: { id: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [answer, setAnswer] = useState<Awaited<ReturnType<typeof loadAnswer>> | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    dialog.current?.showModal();
    if (!answer) startTransition(async () => setAnswer(await loadAnswer(id)));
  }

  return (
    <>
      <Button type="button" variant="quiet" onClick={open}>
        Answer
      </Button>
      <dialog
        ref={dialog}
        className="m-auto h-[90vh] w-[90vw] max-w-none rounded-md border border-line bg-paper px-8 py-7 backdrop:bg-ink/45"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <button type="button" className="sticky top-0 float-right bg-transparent p-0 text-[26px] leading-none text-muted hover:bg-transparent hover:text-ink" aria-label="Close" onClick={() => dialog.current?.close()}>
          ×
        </button>
        <b>Claude&apos;s answer</b>
        {pending && <p className="text-muted">Loading…</p>}
        {answer?.failed && <Msg tone="error">{answer.failed}</Msg>}
        {answer?.error && <Msg tone="error">{answer.error}</Msg>}
        {answer && !answer.failed && (
          answer.raw ? <pre className="mt-3 whitespace-pre-wrap break-words text-xs">{pretty(answer.raw)}</pre> : <p className="text-muted">No answer came back.</p>
        )}
      </dialog>
    </>
  );
}
