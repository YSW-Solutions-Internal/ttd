"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/app/ui";

const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * A file input that also takes files dropped on it or pasted (Ctrl+V) anywhere
 * on the page. The files go into the input itself, so the form submits as usual.
 * The whole box opens the picker. A multiple input adds every choice (picker, drop or
 * paste) to the list shown below it; a single one replaces it.
 */
export function FileDrop(props: Omit<ComponentProps<"input">, "type">) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [chosen, setChosen] = useState<File[]>([]);

  function keep(files: File[]) {
    const el = input.current;
    if (!el) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    el.files = dt.files;
    setChosen(files);
  }

  function add(files: FileList | File[]) {
    const fresh = Array.from(files);
    // Some browsers empty the input when the picker is cancelled; put the list back.
    if (fresh.length === 0) return keep(chosen);
    if (!props.multiple) return keep([fresh[0]]);
    keep([...chosen, ...fresh.filter((f) => !chosen.some((c) => same(c, f)))]);
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null;
      // Leave pastes into text fields alone.
      if (t?.closest("input:not([type=file]), textarea, [contenteditable]")) return;
      const files = e.clipboardData?.files;
      if (files?.length) {
        e.preventDefault();
        add(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  // The form clears the input after a submit; clear the list with it.
  useEffect(() => {
    const form = input.current?.form;
    const clear = () => setChosen([]);
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  return (
    <div className="flex-[1_1_280px]">
      {/* A label, so a click anywhere in the box opens the picker; the input itself is hidden. */}
      <label
        className={`relative m-0 flex cursor-pointer flex-wrap items-center gap-2 rounded border border-dashed px-2.5 py-2 text-sm font-normal hover:border-ink hover:bg-paper focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-deep ${over ? "border-ink bg-paper" : "border-field"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
      >
        {/* The picker replaces the input's files, so add its choice to what was already chosen. */}
        {/* Hidden but still focusable and still validated; the box shows the focus instead. */}
        <input ref={input} type="file" {...props} className="pointer-events-none absolute inset-0 size-full opacity-0" onChange={(e) => add(e.currentTarget.files ?? [])} />
        <span>
          <b>{props.multiple ? "Choose files" : "Choose a file"}</b>
          <span className="text-muted">, drop {props.multiple ? "them" : "it"} here, or paste an image</span>
        </span>
      </label>
      {chosen.length > 0 && (
        <ul className="mt-1.5 grid grid-cols-[max-content_max-content] gap-x-3.5 gap-y-0.5 text-[13px] [&>li]:contents">
          {chosen.map((f) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`}>
              <span>{f.name}</span>
              <Button type="button" variant="quiet" aria-label={`Remove ${f.name}`} onClick={() => keep(chosen.filter((c) => c !== f))}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
