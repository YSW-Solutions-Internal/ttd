import { tripStatusLabel } from "@/lib/trip-status";

// The repeated pieces of UI (Msg, Badge and the Trip status badge, Button); everything else is Tailwind classes in place.

const MSG = {
  info: "border-teal-deep text-ink",
  error: "border-danger text-danger",
};

/** A one-line notice under a form or beside an action: saved, failed, adding… */
export function Msg({
  tone = "info",
  as: Tag = "div",
  className = "",
  children,
}: {
  tone?: keyof typeof MSG;
  as?: "div" | "span" | "small";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag role={tone === "error" ? "alert" : undefined} className={`border-l-3 bg-white px-3 py-2 text-[13px] ${MSG[tone]} ${className}`}>
      {children}
    </Tag>
  );
}

const BADGE = {
  neutral: "border-line bg-paper text-muted",
  teal: "border-teal-deep text-teal-deep",
  tealSolid: "border-teal-deep bg-teal-deep text-white",
  ink: "border-ink text-ink",
  danger: "border-danger/40 bg-danger/5 text-danger",
  amber: "border-amber bg-amber/10 text-amber-text",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: keyof typeof BADGE;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-px text-xs font-semibold whitespace-nowrap ${BADGE[tone]} ${className}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, keyof typeof BADGE> = {
  enquiry: "neutral",
  quoted: "teal",
  booked: "tealSolid",
  travelled: "ink",
  cancelled: "danger",
};

export const TripStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONE[status] ?? "neutral"}>{tripStatusLabel(status)}</Badge>
);

/** Also used on Links that act as buttons, so both look the same. */
export const BUTTON = {
  primary:
    "inline-block cursor-pointer rounded border-0 bg-teal-deep px-4 py-2 font-semibold text-white hover:bg-ink hover:no-underline disabled:cursor-wait disabled:opacity-60",
  quiet: "cursor-pointer bg-transparent p-0 font-medium text-muted hover:text-ink hover:underline",
  danger: "cursor-pointer bg-transparent p-0 font-semibold text-danger hover:underline",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON }) {
  return <button type={type} className={`${BUTTON[variant]} ${className}`} {...props} />;
}
