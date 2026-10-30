"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import logo from "@/lib/pdf/logo.png";

const isPhone = () => window.matchMedia("(max-width: 700px)").matches;

/**
 * Top bar with the burger button, plus the side menu it opens. On desktop the
 * menu pushes the page aside and its open/closed state is kept in the "nav"
 * cookie (read by the layout, so pages render without a flash). On phones it
 * slides over the page, always starts closed and is never saved.
 */
export function NavShell({
  isAdmin,
  isAccounts,
  initialOpen,
  who,
  children,
}: {
  isAdmin: boolean;
  isAccounts: boolean; // Accountants and Administrators
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
    ...(isAccounts ? [{ href: "/accounts", label: "Accounts", active: path.startsWith("/accounts") }] : []),
    ...(isAdmin
      ? [
          { href: "/admin/users", label: "Users", active: path.startsWith("/admin/users") },
          { href: "/admin/suppliers", label: "Suppliers", active: path.startsWith("/admin/suppliers") },
        ]
      : []),
  ];

  return (
    <>
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-2 max-[700px]:px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="bg-transparent px-1.5 py-0.5 text-xl leading-none text-teal-deep hover:bg-paper"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="sidenav"
            onClick={toggle}
          >
            ☰
          </button>
          <Link href="/" className="flex items-center gap-2.5 text-ink hover:no-underline">
            <Image src={logo} alt="The Travel Department" width={44} height={44} priority />
            <span className="font-display text-[22px]">Quotes</span>
          </Link>
        </div>
        {who}
      </header>
      <div className="flex items-start">
        {open && (
          <>
            <div className="fixed inset-0 z-40 hidden bg-ink/35 max-[700px]:block" onClick={() => setOpen(false)} />
            <nav
              id="sidenav"
              className="sticky top-0 flex w-[184px] shrink-0 flex-col py-5 max-[700px]:fixed max-[700px]:inset-y-0 max-[700px]:left-0 max-[700px]:z-50 max-[700px]:w-60 max-[700px]:bg-white max-[700px]:shadow-xl"
              aria-label="Main"
            >
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={i.active ? "page" : undefined}
                  onClick={closeOnPhone}
                  className="border-l-3 border-transparent px-6 py-2 text-ink hover:bg-white hover:no-underline aria-[current=page]:border-teal aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-teal-deep"
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
