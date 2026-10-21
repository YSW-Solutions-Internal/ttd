"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAction } from "@/lib/auth";
import { isRole } from "@/lib/roles";

export type UserFormState = { error?: string; notice?: string };

const USERS_PATH = "/admin/users";

/**
 * Invites someone by email. Admins only.
 *
 * The invitation row is written first, as the admin, and carries the role.
 * Supabase then creates the auth user, and the database (handle_new_user in
 * migration 0005) only allows that because the invitation exists. The role
 * is applied there, from the invitation, in the same transaction.
 */
export async function inviteUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "");

  if (!email) return { error: "Enter an email address." };
  if (!isRole(role)) return { error: "Choose a role." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) return { error: `${email} already has an account.` };

  const { data: invitation, error: invError } = await supabase
    .from("invitations")
    .insert({ email, full_name: fullName, role, invited_by: guard.profile.id })
    .select("id")
    .single();

  if (invError || !invitation) {
    // 23505: the partial unique index, i.e. an open invitation already exists.
    if (invError?.code === "23505") {
      return { error: `${email} already has an open invitation.` };
    }
    return { error: `Could not record the invitation: ${invError?.message ?? "unknown error"}` };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email);

  if (error) {
    // Nothing was created in auth, so withdraw the invitation rather than
    // leave an open one behind.
    await supabase.from("invitations").delete().eq("id", invitation.id);
    return { error: `Could not send the invite: ${error.message}` };
  }

  revalidatePath(USERS_PATH);
  return { notice: `Invite sent to ${email}.` };
}

/**
 * Changes someone's role, including promoting them to admin. Admins only.
 *
 * Runs with the admin's own session, not the service key, so the database
 * checks it as well: guard_role_change refuses any role change not made by
 * an admin, and refuses to demote the last admin.
 */
export async function setRole(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const guard = await requireAdminAction();
  if (!guard.ok) return { error: guard.error };

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId) return { error: "No user was given." };
  if (!isRole(role)) return { error: "That is not a valid role." };

  if (userId === guard.profile.id && role !== "admin") {
    return { error: "You cannot remove your own administrator role. Ask another admin." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id");

  if (error) return { error: `Could not change the role: ${error.message}` };
  // RLS filters rather than errors, so zero rows means the update was refused.
  if (!data || data.length === 0) return { error: "Could not change the role: not permitted." };

  revalidatePath(USERS_PATH);
  return { notice: "Role updated." };
}
