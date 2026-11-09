"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type OptionColumn = { key: string; label: string; align?: "right" };
export type OptionRow = {
  id: string;
  /** Source image this Item came from: its thumbnail highlights the row (image-links.tsx). */
  imageId?: string;
  title: string;
  /** Shown at the top right of the dialog, beside its close button. */
  action?: ReactNode;
  cells: Record<string, ReactNode>;
  /** The Item's full form, shown in its dialog. */
  content: ReactNode;
};

/**
 * Items as a table, one row each; a row opens that Item's form in a dialog.
 * Every dialog's form stays mounted (a closed <dialog> is only hidden), so autosave keeps
 * running and nothing typed is lost when it closes. Closing moves focus, which makes the
 * browser fire `change` on the field being edited, and that saves it.
 */
export function OptionTable({ columns, rows, add }: { columns: OptionColumn[]; rows: OptionRow[]; add?: ReactNode }) {
  const dialogs = useRef(new Map<string, HTMLDialogElement>());
  const open = (id: string) => dialogs.current.get(id)?.showModal();

  // After "add", the new Item is the one id that was not there before: open it.
  const known = useRef(new Set(rows.map((r) => r.id)));
  const adding = useRef(false);
  useEffect(() => {
    const fresh = rows.find((r) => !known.current.has(r.id));
    known.current = new Set(rows.map((r) => r.id));
    if (adding.current && fresh) {
      adding.current = false;
      dialogs.current.get(fresh.id)?.showModal();
    }
  }, [rows]);

  return (
    <>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-image={r.imageId} onClick={() => open(r.id)} className="cursor-pointer hover:bg-paper">
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align === "right" ? "text-right tabular-nums" : undefined}>
                    {i === 0 ? (
                      // The keyboard way in; clicking anywhere else on the row does the same.
                      <button
                        type="button"
                        className="bg-transparent p-0 text-left font-semibold text-teal-deep hover:bg-transparent hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r.id);
                        }}
                      >
                        {r.cells[c.key]}
                      </button>
                    ) : (
                      r.cells[c.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.map((r) => (
        <dialog
          key={r.id}
          ref={(el) => {
            if (el) dialogs.current.set(r.id, el);
            else dialogs.current.delete(r.id);
          }}
          aria-label={r.title}
          // A click on the backdrop lands on the dialog itself; one inside the content lands on the content.
          // Nested dialogs (a flight's) bubble their clicks up here too, so only the dialog's own target counts.
          onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
          className="m-auto max-h-[92vh] w-[min(1100px,94vw)] max-w-none rounded-md border border-line bg-paper p-0 backdrop:bg-ink/60"
        >
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <b className="font-display text-xl font-normal">{r.title}</b>
              <span className="ml-auto flex items-center gap-4">
                {r.action}
                <button
                  type="button"
                  aria-label="Close"
                  className="bg-transparent p-0 text-xl leading-none text-muted hover:bg-transparent hover:text-ink"
                  onClick={(e) => e.currentTarget.closest("dialog")?.close()}
                >
                  ✕
                </button>
              </span>
            </div>
            {r.content}
          </div>
        </dialog>
      ))}

      {add && (
        <div className={rows.length > 0 ? "mt-4" : undefined} onSubmitCapture={() => (adding.current = true)}>
          {add}
        </div>
      )}
    </>
  );
}
