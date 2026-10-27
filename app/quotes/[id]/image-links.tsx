"use client";

import { useRef, useState, type ReactNode } from "react";

/** A <dialog> that closes on Esc (built in), on its ✕, or on a click outside its content. */
function Dialog({
  dialog,
  className = "image-dialog",
  children,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <dialog ref={dialog} className={className} onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
      <button type="button" className="link close" aria-label="Close" onClick={() => dialog.current?.close()}>
        ✕
      </button>
      {children}
    </dialog>
  );
}

const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * An image beside its Items: opens nearly full screen over the page instead of in a new tab.
 * Zoom is a multiple of the size that fits the screen; scroll to move around a zoomed image.
 */
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  function measure(img: HTMLImageElement) {
    const box = stage.current;
    // The image can finish loading while the dialog is closed (no size yet); opening measures it then.
    if (!box || !box.clientWidth || !img.naturalWidth) return;
    const scale = Math.min(box.clientWidth / img.naturalWidth, box.clientHeight / img.naturalHeight);
    setFit({ w: img.naturalWidth * scale, h: img.naturalHeight * scale });
  }
  const step = (by: number) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + by))]);

  return (
    <>
      <button
        type="button"
        className="image-open"
        title="View larger"
        onClick={() => {
          setZoom(1);
          dialog.current?.showModal();
          const img = stage.current?.querySelector("img");
          if (img?.complete) measure(img);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} />
      </button>
      <Dialog dialog={dialog} className="image-dialog viewer">
        <div className="zoom-bar">
          <button type="button" onClick={() => step(-1)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => step(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>Fit</button>
          <a href={src} target="_blank" rel="noreferrer">Open full size</a>
        </div>
        <div className="zoom-stage" ref={stage}>
          {/* Click to zoom in, and back to fit once fully zoomed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onLoad={(e) => measure(e.currentTarget)}
            onClick={() => setZoom((z) => (z === ZOOMS[ZOOMS.length - 1] ? 1 : ZOOMS[ZOOMS.indexOf(z) + 1]))}
            style={fit ? { width: fit.w * zoom, height: fit.h * zoom } : undefined}
            className={zoom === ZOOMS[ZOOMS.length - 1] ? "zoomed-max" : undefined}
          />
        </div>
      </Dialog>
    </>
  );
}

/** Opens a tab and scrolls to this image's block there, briefly highlighted (ids from edit-section.tsx). */
function jump(imageId: string, tab: string) {
  window.location.hash = tab; // EditTabs opens the tab on hashchange
  setTimeout(() => {
    const block = document.getElementById(`block-${tab}-${imageId}`);
    block?.scrollIntoView({ behavior: "smooth", block: "start" });
    block?.classList.add("flash");
    setTimeout(() => block?.classList.remove("flash"), 1500);
  }, 50);
}

/**
 * A Source image thumbnail that goes to its Items: straight there when they are all in one
 * tab, otherwise asking which tab. An image with no Items is just a picture.
 */
export function JumpToItems({ imageId, tabs, children }: { imageId: string; tabs: [string, string][]; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (tabs.length === 0) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        className="image-open"
        title="Go to its Items"
        onClick={() => (tabs.length === 1 ? jump(imageId, tabs[0][0]) : dialog.current?.showModal())}
      >
        {children}
      </button>
      {tabs.length > 1 && (
        <Dialog dialog={dialog}>
          <p>Which Items from this image?</p>
          <div className="choices">
            {tabs.map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  dialog.current?.close();
                  jump(imageId, tab);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
