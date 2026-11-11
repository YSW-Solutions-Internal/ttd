"use client";

import { useRef, useState } from "react";

const ZOOMS = [1, 1.5, 2, 3, 4];

/** Fits the image to the stage, then zooms in steps of that size; scroll to move around a zoomed image. */
function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  function measure(img: HTMLImageElement) {
    const box = stage.current;
    if (!box || !box.clientWidth || !img.naturalWidth) return;
    const scale = Math.min(box.clientWidth / img.naturalWidth, box.clientHeight / img.naturalHeight);
    setFit({ w: img.naturalWidth * scale, h: img.naturalHeight * scale });
  }
  const step = (by: number) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + by))]);
  const max = zoom === ZOOMS[ZOOMS.length - 1];

  return (
    <>
      <div className="flex items-center gap-2 [&>button]:px-3 [&>button]:py-1">
        <button type="button" onClick={() => step(-1)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out">−</button>
        <span className="min-w-12 text-center text-[13px] tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => step(1)} disabled={max} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>Fit</button>
      </div>
      {/* margin: auto centres an image smaller than the stage and still lets a bigger one scroll from its top-left. */}
      <div ref={stage} className="flex min-h-0 flex-1 overflow-auto rounded border border-line bg-paper">
        {/* Click to zoom in, and back to fit once fully zoomed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onLoad={(e) => measure(e.currentTarget)}
          onClick={() => setZoom((z) => (max ? 1 : ZOOMS[ZOOMS.indexOf(z) + 1]))}
          style={fit ? { width: fit.w * zoom, height: fit.h * zoom } : undefined}
          className={`m-auto max-w-none ${max ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        />
      </div>
    </>
  );
}

/**
 * A link to a PDF, image or uploaded file that opens it in a dialog over the page: images with
 * zoom, everything else in the browser's own viewer (which zooms PDFs). It stays a real link,
 * so middle-click and "Open in new tab" still work.
 */
export function FileLink({
  href,
  title,
  image = false,
  className,
  children,
}: {
  href: string;
  title: string;
  image?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Loaded only once opened: document links mint a one-minute signed URL per request.
  const [src, setSrc] = useState<string | null>(null);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
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
        onClose={() => setSrc(null)}
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
        {src &&
          (image ? (
            <ZoomImage key={src} src={src} alt={title} />
          ) : (
            <iframe src={src} title={title} className="min-h-0 w-full flex-1 rounded border border-line bg-paper" />
          ))}
      </dialog>
    </>
  );
}
