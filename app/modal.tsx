"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Wraps an intercepted route. Closing (Escape, backdrop, ×) goes back in history,
// which drops the intercepted URL and leaves the page underneath.
export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="m-auto h-[90vh] max-h-none w-[90vw] max-w-none rounded-md border border-line bg-paper px-8 py-7 text-inherit backdrop:bg-ink/45 max-[700px]:h-dvh max-[700px]:w-screen max-[700px]:rounded-none max-[700px]:px-4 max-[700px]:py-4.5"
      // React passes a nested dialog's close (a PDF, an image) up to here; only this one's own close goes back.
      onClose={(e) => e.target === ref.current && router.back()}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <button type="button" className="sticky top-0 float-right bg-transparent p-0 text-[26px] leading-none text-muted hover:bg-transparent hover:text-ink" aria-label="Close" onClick={() => ref.current?.close()}>
        ×
      </button>
      {children}
    </dialog>
  );
}
