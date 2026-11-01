import type { Metadata } from "next";
import { Marcellus, Public_Sans } from "next/font/google";
import Image from "next/image";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { signOut } from "./login/actions";
import { AutosaveProvider } from "./autosave";
import { NavShell } from "./side-nav";
import { Button } from "./ui";
import logo from "@/lib/pdf/logo.png";
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
            isAccounts={profile.role === "admin" || profile.role === "accountant"}
            initialOpen={navOpen}
            who={
              <div className="flex items-center gap-3.5 text-[13px] text-muted">
                <span className="max-[700px]:hidden">{profile.email}</span>
                <form action={signOut}>
                  <Button type="submit" variant="quiet">
                    Sign out
                  </Button>
                </form>
              </div>
            }
          >
            <div className="min-w-0 flex-1">{children}</div>
            {modal}
          </NavShell>
        ) : (
          <div className="mx-auto max-w-[380px] px-5 pt-16 pb-10">
            <Image src={logo} alt="The Travel Department" width={150} height={150} priority className="mx-auto mb-8" />
            {children}
          </div>
        )}
        </AutosaveProvider>
      </body>
    </html>
  );
}
