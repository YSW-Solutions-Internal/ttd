"use client";

import { startTransition, useEffect, useRef, type FormEvent } from "react";

/**
 * Props for a <form> whose useActionState action should keep what was typed (files too)
 * when it returns an error: React's own form action clears every field either way.
 * The form still clears after a success.
 */
export function useKeptForm(dispatch: (fd: FormData) => void, state: { error?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error) ref.current?.reset();
  }, [state]);
  return {
    ref,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      startTransition(() => dispatch(fd));
    },
  };
}
