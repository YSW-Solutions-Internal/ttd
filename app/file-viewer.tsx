"use client";

import { useRef, useState } from "react";

/**
 * A link to a PDF or uploaded file that opens it in a dialog over the page, using the browser's own viewer.
 * It stays a real link, so middle-click and "Open in new tab" still work.
 */
export function FileLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Loaded only once opened: document links mint a one-minute signed URL per request.
  const [src, setSrc] = useState<string | null>(null);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          setSrc(href);
          dialog.current?.showModal();
        }}
      >
        {children}
      </a>
      <dialog
        ref={dialog}
        aria-label={title}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        onClose={(e) => {
          // React passes close up to an enclosing Trip modal, whose onClose would navigate back.
          e.stopPropagation();
          setSrc(null);
        }}
        className="m-auto h-[94vh] w-[94vw] max-w-none flex-col gap-2 rounded-md border border-line bg-white p-3 backdrop:bg-ink/60 open:flex max-[700px]:h-dvh max-[700px]:w-screen max-[700px]:rounded-none"
      >
        <div className="flex items-center gap-4 pl-1">
          <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
          <a href={href} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="bg-transparent px-2 py-0 text-xl leading-none text-muted hover:bg-transparent hover:text-ink"
          >
            ✕
          </button>
        </div>
        {src && <iframe src={src} title={title} className="min-h-0 w-full flex-1 rounded border border-line bg-paper" />}
      </dialog>
    </>
  );
}
