/**
 * Role names and labels, with no server imports, so Client Components can use
 * them too. The server-side guards live in lib/auth.ts.
 */

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: "Standard user",
  admin: "Administrator",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};
