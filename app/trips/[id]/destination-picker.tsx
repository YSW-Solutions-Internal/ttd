"use client";

import { useId, useRef, useState, useTransition } from "react";
import { addDestination, guessCity } from "../stay-actions";
import type { DestinationOption } from "./stays-form";
import { Button, Msg } from "@/app/ui";

/** Every country's English name, for the add form's suggestions. */
function countryNames(): string[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out = new Set<string>();
  for (const a of A) {
    for (const b of A) {
      const code = a + b;
      // Retired codes (FX, RH) canonicalise to today's and are skipped, as in lib/fees.ts.
      const name = Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}` ? names.of(code) : undefined;
      if (name && name !== code) out.add(name);
    }
  }
  return [...out].sort();
}

const shown = (d: DestinationOption) => `${d.label} · ${d.code}`;

/**
 * A Stay's Destination: type to search by name, country or code. When nothing matches,
 * offers to add what was typed as a new Destination, which is then picked.
 * The text box has no name, so autosave only ever sees the code, through onPick.
 */
export function DestinationPicker({
  value,
  destinations,
  onPick,
}: {
  value: string | null | undefined;
  destinations: DestinationOption[];
  onPick: (code: string) => void;
}) {
  const listId = useId();
  const countriesId = useId();
  const current = destinations.find((d) => d.code === value);
  const [text, setText] = useState(current ? shown(current) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [countries, setCountries] = useState<string[]>([]);

  const match = destinations.find((d) => shown(d) === text);
  const typed = text.trim();

  function choose(next: string) {
    setText(next);
    const d = destinations.find((x) => shown(x) === next);
    if (d && d.code !== value) onPick(d.code);
  }

  function openAdd() {
    if (countries.length === 0) setCountries(countryNames());
    setError(null);
    form.current?.reset();
    const f = form.current?.elements;
    if (f) (f.namedItem("name") as HTMLInputElement).value = typed;
    dialog.current?.showModal();
    startTransition(async () => {
      const guess = await guessCity(typed);
      if (guess && f) {
        (f.namedItem("country") as HTMLInputElement).value ||= guess.country;
        (f.namedItem("code") as HTMLInputElement).value ||= guess.code;
      }
    });
  }

  function add(fd: FormData) {
    startTransition(async () => {
      const r = await addDestination(fd);
      if (r.error || !r.code || !r.label) return setError(r.error ?? "Could not add the destination.");
      dialog.current?.close();
      setText(shown({ code: r.code, label: r.label }));
      onPick(r.code);
    });
  }

  return (
    <div className="list-arrow-off min-w-[280px]">
      <input
        type="text"
        list={listId}
        aria-label="Destination"
        placeholder="Search destinations…"
        value={text}
        onChange={(e) => choose(e.target.value)}
        // Leaving the box with a half-typed search puts the chosen Destination back.
        onBlur={() => !match && current && !typed && setText(shown(current))}
      />
      <datalist id={listId}>
        {destinations.map((d) => (
          <option key={d.code} value={shown(d)} />
        ))}
      </datalist>
      {typed.length >= 2 && !match && (
        <Button type="button" variant="quiet" className="mt-1 block text-left text-xs" onClick={openAdd}>
          Add “{typed}” as a destination
        </Button>
      )}

      <dialog ref={dialog} className="m-auto max-h-[92vh] max-w-[92vw] rounded-md border border-line bg-white p-4 backdrop:bg-ink/60" onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}>
        <form ref={form} action={add} className="list-arrow-off flex w-[min(420px,80vw)] flex-col gap-2.5 [&_label_input]:mt-1 [&_label_input]:font-normal">
          <b>Add a destination</b>
          <p className="mb-4 text-muted">It is added for everyone. The country sets the Fee region of Items in this Stay.</p>
          {/* data-autosave="off": these sit inside the Stay row, whose autosave listens for changes. */}
          <label>
            Name
            <input type="text" name="name" required data-autosave="off" />
          </label>
          <label>
            Country
            <input type="text" name="country" list={countriesId} required data-autosave="off" placeholder="Start typing…" />
          </label>
          <datalist id={countriesId}>
            {countries.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label>
            Airport or city code (optional)
            <input type="text" name="code" maxLength={12} data-autosave="off" placeholder="e.g. MUB; left empty, one is made up" />
          </label>
          {error && <Msg tone="error">{error}</Msg>}
          <div className="flex items-center gap-3.5">
            <button type="submit" disabled={pending}>
              {pending ? "Working…" : "Add"}
            </button>
            <Button type="button" variant="quiet" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
