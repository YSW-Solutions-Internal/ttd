/**
 * Role names and labels, with no server imports, so Client Components can use
 * them too. The server-side guards live in lib/auth.ts.
 */

export const ROLES = ["user", "admin", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: "Standard user",
  admin: "Administrator",
  accountant: "Accountant",
};

/** Accountants see everything but edit no Client, Trip or Quote (ADR 0010); the database enforces it too. */
export const canEdit = (role: Role) => role !== "accountant";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};
