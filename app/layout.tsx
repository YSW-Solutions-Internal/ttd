import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { signOut } from "./login/actions";
import { SideNav } from "./side-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTD Quotes",
  description: "Travel quote builder for The Travel Department staff",
};

export default async function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const profile = await getProfile();

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            TTD Quotes
          </Link>
          {profile && (
            <div className="who">
              <span>{profile.email}</span>
              <form action={signOut}>
                <button type="submit" className="link">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </header>
        {profile ? (
          <div className="shell">
            <SideNav isAdmin={profile.role === "admin"} />
            <div className="shell-main">{children}</div>
            {modal}
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
