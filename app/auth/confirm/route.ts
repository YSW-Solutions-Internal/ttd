import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the invite email's link lands. Exchanges the one-time token for a
 * session cookie, then sends the new user to choose a password.
 *
 * The invite email template in Supabase must point here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 *
 * Only "invite" is accepted, and the destination is fixed rather than read
 * from the URL, so this cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && type === "invite") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    if (!error) redirect("/account/set-password");
    console.error("Invite confirmation failed:", error.code, error.message);
  }

  redirect("/login?error=invite");
}
