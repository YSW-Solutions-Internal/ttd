"use client";

import * as Radix from "@radix-ui/react-select";
import { useEffect, useRef, useState } from "react";

// Radix will not take "" as an item's value, but our forms submit "" for "Not chosen", "Economy" and the like.
const NONE = "\u0000none";

const icon = (d: string, className: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    <path d={d} />
  </svg>
);

/**
 * The app's dropdown: Radix draws it the same in every browser (as in sa-rent-2-own), and a hidden native
 * <select> carries the name, so FormData, autosave's change events and required checks work as before.
 * `placeholder` shows while nothing is chosen; without one the first option is chosen, like a native select.
 */
export function Select({
  name,
  options,
  defaultValue,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  id,
  className = "block",
  "aria-label": ariaLabel,
}: {
  name: string;
  options: [value: string, label: string][];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const [own, setOwn] = useState(defaultValue ?? (placeholder !== undefined ? "" : (options[0]?.[0] ?? "")));
  const initial = useRef(own);
  const current = value ?? own;

  // Autosave writes server values into the hidden select, and a form reset resets it; the visible box follows both.
  useEffect(() => {
    const select = ref.current!;
    const follow = () => setOwn(select.value);
    const reset = () => setOwn(initial.current);
    select.addEventListener("change", follow);
    select.form?.addEventListener("reset", reset);
    return () => {
      select.removeEventListener("change", follow);
      select.form?.removeEventListener("reset", reset);
    };
  }, []);

  useEffect(() => {
    ref.current!.value = current;
  }, [current]);

  function pick(v: string) {
    const select = ref.current!;
    if (select.matches(":disabled")) return; // a disabled <fieldset> (a locked Item) disables the select but not Radix
    select.value = v === NONE ? "" : v;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    onChange?.(select.value);
  }

  const hasNone = options.some(([v]) => v === "");
  return (
    <span
      data-select
      className={`relative ${className}`}
      // Radix's own nameless hidden select also fires change; only ours speaks for this field.
      onChange={(e) => e.target !== ref.current && e.stopPropagation()}
    >
      <Radix.Root value={current === "" ? (hasNone ? NONE : "") : current} onValueChange={pick} disabled={disabled}>
        <Radix.Trigger
          id={id}
          aria-label={ariaLabel}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-field bg-white px-3 py-2 text-left font-normal whitespace-nowrap text-ink shadow-xs hover:bg-white focus-visible:border-teal-deep focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted"
        >
          <span className="truncate">
            <Radix.Value placeholder={placeholder} />
          </span>
          {icon("m6 9 6 6 6-6", "size-4 shrink-0 text-muted opacity-50")}
        </Radix.Trigger>
        {/* shortcut: no Portal, so the list opens inside the <dialog> modals (the top layer hides anything portalled to body). */}
        <Radix.Content
          position="popper"
          sideOffset={4}
          className="relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-lg border border-line bg-white text-ink shadow-md"
        >
          <Radix.Viewport className="w-full min-w-(--radix-select-trigger-width) p-1">
            {options.map(([v, label]) => (
              <Radix.Item
                key={v}
                value={v === "" ? NONE : v}
                className="relative flex w-full cursor-default items-center rounded-md py-1.5 pr-8 pl-2 outline-none select-none focus:bg-[#f5f5f5] data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute right-2 flex size-3.5 items-center justify-center">
                  <Radix.ItemIndicator>{icon("M20 6 9 17l-5-5", "size-4 text-muted")}</Radix.ItemIndicator>
                </span>
                <Radix.ItemText>{label}</Radix.ItemText>
              </Radix.Item>
            ))}
          </Radix.Viewport>
        </Radix.Content>
      </Radix.Root>
      <select ref={ref} name={name} defaultValue={current} required={required} disabled={disabled} aria-hidden tabIndex={-1} className="sr-only">
        {placeholder !== undefined && !hasNone && <option value="" />}
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </span>
  );
}
