import type { Metadata } from "next";
import { Marcellus, Public_Sans } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { signOut } from "./login/actions";
import { AutosaveProvider } from "./autosave";
import { NavShell } from "./side-nav";
import "./globals.css";

const display = Marcellus({ weight: "400", subsets: ["latin"], variable: "--font-marcellus" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans" });

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
  const navOpen = (await cookies()).get("nav")?.value === "open";

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <AutosaveProvider>
        {profile ? (
          <NavShell
            isAdmin={profile.role === "admin"}
            initialOpen={navOpen}
            who={
              <div className="who">
                <span>{profile.email}</span>
                <form action={signOut}>
                  <button type="submit" className="link">
                    Sign out
                  </button>
                </form>
              </div>
            }
          >
            <div className="shell-main">{children}</div>
            {modal}
          </NavShell>
        ) : (
          <>
            <header className="topbar">
              <Link href="/" className="brand">
                TTD Quotes
              </Link>
            </header>
            {children}
          </>
        )}
        </AutosaveProvider>
      </body>
    </html>
  );
}
