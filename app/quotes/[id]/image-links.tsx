"use client";

import { useRef, type ReactNode } from "react";

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

/** Opens a tab, scrolls to the image's first Item there and briefly highlights all of them (data-image in edit-section.tsx). */
function jump(imageId: string, tab: string) {
  window.location.hash = tab; // EditTabs opens the tab on hashchange
  setTimeout(() => {
    const items = document.querySelectorAll(`#panel-${tab} [data-image="${imageId}"]`);
    items[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
    items.forEach((el) => el.classList.add("flash"));
    setTimeout(() => items.forEach((el) => el.classList.remove("flash")), 1500);
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
