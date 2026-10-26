import { createAdminClient } from "@/lib/supabase/admin";
import { readQueued, type QueuedImage } from "@/lib/extraction/run";
import { one } from "@/lib/relations";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// Runs every minute (vercel.json). No new image starts after 50 s, so at most a few runs overlap.
const START_BUDGET_MS = 50_000;

/**
 * Reads images a Consultant queued that no run has finished: still pending, or running
 * past the 5-minute lock (a run that died). Failed images wait for the Extract button.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return new Response("ANTHROPIC_API_KEY is not set.", { status: 500 });

  // Service key: there is no signed-in user here. It only touches images already queued.
  const supabase = createAdminClient();
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("extractions")
    .select("images!inner(id, quote_id, storage_path, removed_at)")
    .or(`status.eq.pending,and(status.eq.running,started_at.lt.${stale})`)
    .is("images.removed_at", null);
  if (error) return new Response(error.message, { status: 500 });

  const images = (data ?? []).map((r) => one(r.images) as QueuedImage);
  await readQueued(supabase, images, START_BUDGET_MS);
  return Response.json({ queued: images.length });
}
