import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/roles";

// Client Components must import these from @/lib/roles instead: this module
// pulls in next/headers and cannot be bundled for the browser.
export type { Profile, Role } from "@/lib/roles";
export { ROLES, ROLE_LABELS, isRole } from "@/lib/roles";

/** The signed-in user's profile, or null if nobody is signed in. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

/**
 * Guard for admin-only pages: sends anyone else away rather than rendering.
 * The role is read from the database on every call, so demoting someone takes
 * effect on their next request without them signing out.
 */
export async function requireAdminPage(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");
  return profile;
}

/**
 * Guard for admin-only server actions. Returns the admin's profile, or an
 * error message for the caller to show. Every user-management action calls
 * this first: it is the real boundary, since a server action can be invoked
 * directly and not just from our own UI.
 */
export async function requireAdminAction(): Promise<
  { ok: true; profile: Profile } | { ok: false; error: string }
> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };
  if (profile.role !== "admin") {
    return { ok: false, error: "Only administrators can manage users." };
  }
  return { ok: true, profile };
}
