"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";

/**
 * A file input that also takes files dropped on it or pasted (Ctrl+V) anywhere
 * on the page. The files go into the input itself, so the form submits as usual.
 */
export function FileDrop(props: Omit<ComponentProps<"input">, "type">) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function add(files: FileList | File[]) {
    const el = input.current;
    if (!el || files.length === 0) return;
    const dt = new DataTransfer();
    // Multiple inputs keep what was already chosen; single ones take the first new file.
    const all = props.multiple ? [...Array.from(el.files ?? []), ...Array.from(files)] : [files[0]];
    all.forEach((f) => dt.items.add(f));
    el.files = dt.files;
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

  return (
    <div
      className={over ? "file-drop over" : "file-drop"}
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
      <input ref={input} type="file" {...props} />
      <span className="file-drop-hint">or drop here, or paste an image</span>
    </div>
  );
}
