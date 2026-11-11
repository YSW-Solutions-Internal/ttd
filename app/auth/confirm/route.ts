import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Where invite and password reset emails land. Exchanges the one-time token
 * for a session cookie, then sends the user to choose a password.
 *
 * The Supabase email templates must point here. RedirectTo is this route on
 * the deployment that sent the email, with ?type= already on it:
 *   Invite user:     {{ .RedirectTo }}&token_hash={{ .TokenHash }}
 *   Reset password:  {{ .RedirectTo }}&token_hash={{ .TokenHash }}
 *
 * With the default Reset password template (needs no custom SMTP), Supabase
 * redirects here with ?code= instead. That code only works in the browser
 * that asked for the reset, because the PKCE verifier is a cookie there.
 *
 * A token_hash link only opens the Continue page (/auth/continue); its button
 * posts back here, and only that uses the token. Mail scanners (Microsoft Safe
 * Links) open every link in an email and would use it up before the person does.
 *
 * Only those two types are accepted, and the destination is fixed rather than
 * read from the URL, so this cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");

  if (code && type === "recovery") {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect("/account/set-password?reset=1");
    console.error("Reset code exchange failed:", error.code, error.message);
  }

  if (tokenHash && (type === "invite" || type === "recovery")) {
    redirect(`/auth/continue?${new URLSearchParams({ type, token_hash: tokenHash })}`);
  }

  redirect("/login?error=link");
}

/** The Continue button: uses the token. 303, so the browser follows with a GET. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  let to = "/login?error=link";

  if (typeof tokenHash === "string" && tokenHash && (type === "invite" || type === "recovery")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) to = type === "recovery" ? "/account/set-password?reset=1" : "/account/set-password";
    else console.error("Email link confirmation failed:", type, error.code, error.message);
  }

  return NextResponse.redirect(new URL(to, request.url), 303);
}
