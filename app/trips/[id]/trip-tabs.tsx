"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

export type TripTab = { id: string; label: string; warn?: string; content: ReactNode };

/**
 * The Trip's sections as tabs. Every panel stays rendered (only hidden), so edits in one tab
 * keep autosaving while another is open. Anchors to something inside a hidden panel (#quote,
 * #stays, a link from another page) open that panel first, then scroll to it. Arrow keys,
 * Home and End move between tabs.
 */
export function TripTabs({ tabs }: { tabs: TripTab[] }) {
  const [open, setOpen] = useState(tabs[0].id);

  // Shows the element an anchor points at, opening its tab if needed. False if it is not in a tab.
  // Reads the panel's own data attribute, not the tabs prop: that prop is new on every server
  // refresh (each autosave), and these listeners must not re-run and scroll back mid-edit.
  useEffect(() => {
    const reveal = (hash: string) => {
      const el = hash ? document.getElementById(decodeURIComponent(hash)) : null;
      const tab = el?.closest<HTMLElement>("[data-trip-panel]")?.dataset.tripPanel;
      if (!el || !tab) return false;
      flushSync(() => setOpen(tab));
      el.scrollIntoView();
      return true;
    };
    reveal(window.location.hash.slice(1));
    const onHash = () => reveal(window.location.hash.slice(1));
    // hashchange does not fire for a link to the hash already in the URL.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='#']");
      if (a && reveal(a.getAttribute("href")!.slice(1))) e.preventDefault();
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === open);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setOpen(tabs[next].id);
    document.getElementById(`trip-tab-${tabs[next].id}`)?.focus();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`trip-tab-${t.id}`}
            aria-selected={open === t.id}
            aria-controls={`trip-panel-${t.id}`}
            tabIndex={open === t.id ? 0 : -1}
            className={`-mb-px rounded-t rounded-b-none border border-b-0 px-3.5 py-2 font-semibold ${open === t.id ? "border-line bg-white text-ink hover:bg-white" : "border-transparent bg-transparent text-muted hover:bg-white hover:text-ink"}`}
            onClick={() => setOpen(t.id)}
          >
            {t.label}
            {t.warn && (
              <span title={t.warn}>
                <span aria-hidden="true" className="ml-1.5 inline-block size-2 rounded-full bg-danger align-middle" />
                <span className="sr-only">, {t.warn}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`trip-panel-${t.id}`} data-trip-panel={t.id} aria-labelledby={`trip-tab-${t.id}`} hidden={open !== t.id}>
          {t.content}
        </div>
      ))}
    </>
  );
}
