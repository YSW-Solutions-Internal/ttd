"use client";

import { useEffect, useState, type ReactNode } from "react";

export type EditTab = { id: string; label: string; count: number; warn: boolean; content: ReactNode };

/**
 * One tab per kind of Item. Every panel stays rendered (only hidden), so edits in other
 * tabs keep autosaving and Generate version can still save them first. The open tab
 * lives in the URL hash; without one, the first tab with Items opens.
 */
export function EditTabs({ tabs }: { tabs: EditTab[] }) {
  const fallback = (tabs.find((t) => t.count > 0) ?? tabs[0]).id;
  const [open, setOpen] = useState(fallback);

  useEffect(() => {
    // Other anchors on the Trip page (#quote, #stays) leave the open tab alone.
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === id)) setOpen(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function choose(id: string) {
    setOpen(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={open === t.id}
            aria-controls={`panel-${t.id}`}
            className={`-mb-px rounded-t rounded-b-none border border-b-0 px-3.5 py-2 font-semibold ${open === t.id ? "border-line bg-white text-ink hover:bg-white" : "border-transparent bg-transparent text-muted hover:bg-white hover:text-ink"}`}
            onClick={() => choose(t.id)}
          >
            {t.label} <span className="font-normal tabular-nums">({t.count})</span>
            {t.warn && (
              <span title="Something here stops Generate version">
                <span aria-hidden="true" className="ml-1.5 inline-block size-2 rounded-full bg-danger align-middle" />
                <span className="sr-only">, has something that stops Generate version</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={open !== t.id}>
          {t.content}
        </div>
      ))}
    </>
  );
}
