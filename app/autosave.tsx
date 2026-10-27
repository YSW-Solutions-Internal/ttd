"use client";

import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import type { SaveResult } from "@/lib/form-values";
import { SaveQueue, type SaveState } from "@/lib/save-queue";

type Entry = { queue: SaveQueue; label: string; typing: boolean };

/** Every autosaving record on screen, so leaving and Generate version can wait for them. */
class Registry {
  entries = new Map<string, Entry>();
  blocks = new Map<string, string>();

  /** Anything that would be lost by leaving now. */
  unsafe(): boolean {
    return this.blocks.size > 0 || [...this.entries.values()].some((e) => e.queue.unsaved || e.typing);
  }

  async waitForSaves(): Promise<string[]> {
    await Promise.all([...this.entries.values()].map((e) => e.queue.idle()));
    return [...this.entries.values()].filter((e) => e.queue.state === "failed").map((e) => e.label);
  }
}

const AutosaveContext = createContext<Registry | null>(null);

function useRegistry(): Registry {
  const registry = useContext(AutosaveContext);
  if (!registry) throw new Error("AutosaveProvider is missing.");
  return registry;
}

export function AutosaveProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new Registry());
  const router = useRouter();

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (registry.unsafe()) e.preventDefault();
    };

    // In-app links wait for running saves, then go; they ask first only if something could not be saved.
    // shortcut: browser back/forward is not held up (the App Router cannot cancel it); saves already running still finish. Add a guard if edits get lost that way.
    const click = async (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href);
      if (url.origin !== location.origin || !registry.unsafe()) return;
      e.preventDefault();
      e.stopPropagation();
      const failed = [...(await registry.waitForSaves()), ...registry.blocks.values()];
      if (failed.length > 0 && !confirm(`Some changes could not be saved: ${failed.join(", ")}. Leave anyway?`)) return;
      router.push(url.pathname + url.search + url.hash);
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [registry, router]);

  return <AutosaveContext.Provider value={registry}>{children}</AutosaveContext.Provider>;
}

export function useSaves() {
  const registry = useRegistry();
  return {
    /** Waits for every save on screen; returns the labels of records that could not be saved. */
    waitForSaves: () => registry.waitForSaves(),
    /** A reason to warn on leaving that no save holds (label), or none (null). */
    block: (key: string, label: string | null) => {
      if (label) registry.blocks.set(key, label);
      else registry.blocks.delete(key);
    },
  };
}

type FormElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLOutputElement;

/** One record's form: each field saves on its native `change` event (leaving a text box, or picking). */
export function useAutosave({
  key,
  label,
  save,
}: {
  key: string;
  label: string;
  save: (fd: FormData) => Promise<SaveResult>;
}) {
  const registry = useRegistry();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const saveRef = useRef(save);
  saveRef.current = save;

  const [queue] = useState(
    () =>
      new SaveQueue(async (fd) => {
        const r = await saveRef.current(fd);
        apply(r);
        return r;
      }, rerender),
  );
  const [entry] = useState<Entry>(() => ({ queue, label, typing: false }));
  entry.label = label;

  /** Puts server-filled values into the form, never into the field being typed in or one still unsaved. */
  function apply(r: SaveResult) {
    const form = formRef.current;
    if (!form) return;
    for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
    if (r.error) {
      if (r.field) form.querySelector(`[name="${r.field}"]`)?.setAttribute("aria-invalid", "true");
      return;
    }
    for (const [name, value] of Object.entries(r.values ?? {})) {
      const el = form.querySelector(`[name="${name}"]`) as FormElement | null;
      if (!el || el === document.activeElement || queue.has(name)) continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = value === "on";
      else el.value = value;
    }
  }

  useEffect(() => {
    registry.entries.set(key, entry);
    return () => {
      registry.entries.delete(key);
    };
  }, [registry, key, entry]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onChange = (e: Event) => {
      const el = e.target as FormElement;
      if (!el.name || el.dataset.autosave === "off") return;
      entry.typing = false;
      queue.change(el.name, el instanceof HTMLInputElement && el.type === "checkbox" ? (el.checked ? "on" : "off") : el.value);
    };
    const onInput = () => {
      entry.typing = true;
    };
    const onFocusOut = () => {
      entry.typing = false;
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onInput);
    form.addEventListener("focusout", onFocusOut);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onInput);
      form.removeEventListener("focusout", onFocusOut);
    };
  }, [queue, entry]);

  return {
    formRef: formRef as RefObject<HTMLFormElement | null>,
    state: queue.state as SaveState,
    error: queue.state === "failed" ? queue.result : null,
    saved: queue.state === "saved" && queue.result != null,
    unsaved: queue.unsaved,
    change: (name: string, value: string) => queue.change(name, value),
    retry: () => queue.retry(),
  };
}

export type Autosave = ReturnType<typeof useAutosave>;

export function AutosaveStatus({ autosave }: { autosave: Autosave }) {
  const { state, error, saved, unsaved, retry } = autosave;
  return (
    <span className="autosave-status">
      {unsaved && state !== "saving" && <span className="badge">Not saved</span>}
      {state === "saving" && <span className="msg">Saving…</span>}
      {state === "failed" && (
        <span className="msg error">
          Couldn&apos;t save: {error?.error}{" "}
          <button type="button" className="link" onClick={retry}>
            Retry
          </button>
        </span>
      )}
      {saved && !unsaved && <span className="msg">Saved</span>}
    </span>
  );
}

export function FieldError({ autosave, name }: { autosave: Autosave; name: string }) {
  return autosave.error?.field === name ? <small className="msg error">{autosave.error.error}</small> : null;
}
