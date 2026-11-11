"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { BUTTON } from "@/app/ui";

/**
 * A submit button that asks "Are you sure?" on the first click and acts on the
 * second. It goes back to normal after a few seconds or when focus leaves it.
 */
export function ConfirmButton({
  confirmLabel = "Are you sure?",
  className = "",
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
      // Armed, it turns solid red, so the second click reads as the confirmation it is.
      className={`${armedAt === null ? BUTTON.danger : "cursor-pointer rounded bg-danger px-2 py-0.5 font-semibold text-white hover:bg-danger"} ${className}`}
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
