import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTD Quotes",
  description: "Travel quote builder for The Travel Department staff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
              {profile.role === "admin" && <Link href="/admin/users">Users</Link>}
              <span>{profile.email}</span>
              <form action={signOut}>
                <button type="submit" className="link">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
