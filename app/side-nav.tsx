"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  // Quotes live under Trips, so /quotes/* highlights Trips too.
  const items = [
    { href: "/", label: "Trips", active: path === "/" || path.startsWith("/trips") || path.startsWith("/quotes") },
    { href: "/clients", label: "Clients", active: path.startsWith("/clients") },
    ...(isAdmin ? [{ href: "/admin/users", label: "Users", active: path.startsWith("/admin") }] : []),
  ];

  return (
    <nav className="sidenav" aria-label="Main">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
