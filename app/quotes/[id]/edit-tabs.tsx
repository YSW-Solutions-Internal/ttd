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
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={open === t.id}
            aria-controls={`panel-${t.id}`}
            className={open === t.id ? "tab active" : "tab"}
            onClick={() => choose(t.id)}
          >
            {t.label} ({t.count})
            {t.warn && <span className="warn" title="Something here stops Generate version"> ⚠</span>}
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
