import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTD Quotes",
  description: "Travel quote builder for The Travel Department staff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            TTD Quotes
          </Link>
          {user && (
            <div className="who">
              <span>{user.email}</span>
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
