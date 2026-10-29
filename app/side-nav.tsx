"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const isPhone = () => window.matchMedia("(max-width: 700px)").matches;

/**
 * Top bar with the burger button, plus the side menu it opens. On desktop the
 * menu pushes the page aside and its open/closed state is kept in the "nav"
 * cookie (read by the layout, so pages render without a flash). On phones it
 * slides over the page, always starts closed and is never saved.
 */
export function NavShell({
  isAdmin,
  initialOpen,
  who,
  children,
}: {
  isAdmin: boolean;
  initialOpen: boolean;
  who: React.ReactNode;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (isPhone()) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPhone()) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!isPhone()) {
      document.cookie = `nav=${next ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  const closeOnPhone = () => {
    if (isPhone()) setOpen(false);
  };

  // Quotes live under Trips, so /quotes/* highlights Trips too.
  const items = [
    { href: "/", label: "Trips", active: path === "/" || path.startsWith("/trips") || path.startsWith("/quotes") },
    { href: "/clients", label: "Clients", active: path.startsWith("/clients") },
    ...(isAdmin
      ? [
          { href: "/admin/users", label: "Users", active: path.startsWith("/admin/users") },
          { href: "/admin/suppliers", label: "Suppliers", active: path.startsWith("/admin/suppliers") },
        ]
      : []),
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="burger"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="sidenav"
            onClick={toggle}
          >
            ☰
          </button>
          <Link href="/" className="brand">
            TTD Quotes
          </Link>
        </div>
        {who}
      </header>
      <div className="shell">
        {open && (
          <>
            <div className="nav-backdrop" onClick={() => setOpen(false)} />
            <nav id="sidenav" className="sidenav" aria-label="Main">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={i.active ? "page" : undefined}
                  onClick={closeOnPhone}
                >
                  {i.label}
                </Link>
              ))}
            </nav>
          </>
        )}
        {children}
      </div>
    </>
  );
}
