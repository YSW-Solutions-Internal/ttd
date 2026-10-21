import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client holding the service-role key. It bypasses RLS entirely, so
 * it is used for one thing only: sending invites, which needs Supabase's admin
 * auth API. Call it only after requireAdminAction (lib/auth.ts) has passed.
 *
 * SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so Next.js keeps it
 * out of the client bundle; the guard below turns a mistaken client import
 * into a loud error rather than a silent undefined key.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never be called in the browser.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
