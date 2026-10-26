"use client";

import { useEffect, useState, type ComponentProps } from "react";

/**
 * A submit button that asks "Are you sure?" on the first click and acts on the
 * second. It goes back to normal after a few seconds or when focus leaves it.
 */
export function ConfirmButton({
  confirmLabel = "Are you sure?",
  children,
  ...props
}: ComponentProps<"button"> & { confirmLabel?: string }) {
  const [armedAt, setArmedAt] = useState<number | null>(null);

  useEffect(() => {
    if (armedAt === null) return;
    const t = setTimeout(() => setArmedAt(null), 4000);
    return () => clearTimeout(t);
  }, [armedAt]);

  return (
    <button
      {...props}
      type="submit"
      aria-live="polite"
      onBlur={() => setArmedAt(null)}
      onClick={(e) => {
        // The second click of a quick double-click does not count as confirming.
        if (armedAt === null || Date.now() - armedAt < 500) {
          e.preventDefault();
          if (armedAt === null) setArmedAt(Date.now());
        }
      }}
    >
      {armedAt === null ? children : confirmLabel}
    </button>
  );
}
