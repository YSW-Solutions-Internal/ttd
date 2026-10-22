import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Where invite and password reset emails land. Exchanges the one-time token
 * for a session cookie, then sends the user to choose a password.
 *
 * The Supabase email templates must point here:
 *   Invite user:     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 *   Reset password:  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
 *
 * Only those two types are accepted, and the destination is fixed rather than
 * read from the URL, so this cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && (type === "invite" || type === "recovery")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(type === "recovery" ? "/account/set-password?reset=1" : "/account/set-password");
    console.error("Email link confirmation failed:", type, error.code, error.message);
  }

  redirect("/login?error=link");
}
