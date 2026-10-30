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
      className="modal"
      // React passes a nested dialog's close (a PDF, an image) up to here; only this one's own close goes back.
      onClose={(e) => e.target === ref.current && router.back()}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <button type="button" className="modal-close link" aria-label="Close" onClick={() => ref.current?.close()}>
        ×
      </button>
      {children}
    </dialog>
  );
}
