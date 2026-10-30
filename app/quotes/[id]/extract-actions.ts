"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROMPT_VERSION } from "@/lib/extraction/prompts";
import { readQueued } from "@/lib/extraction/run";

export type ExtractState = { message?: string; error?: string };

// The page allows 800 s (page.tsx); the last image to start still has its 240 s to finish.
const START_BUDGET_MS = 520_000;

export async function runExtraction(quoteId: string, _prev: ExtractState): Promise<ExtractState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY is not set on the server." };
  }

  // 1. The images currently in this quote (removed ones are ignored).
  const { data: images } = await supabase
    .from("images")
    .select("id, quote_id, storage_path")
    .eq("quote_id", quoteId)
    .is("removed_at", null);
  if (!images || images.length === 0) return { error: "Add at least one image first." };

  // 2. Queue every one not yet read, failed ones included (migration 0017). An image is read once;
  //    a later prompt change does not re-read it, because staff corrections are keyed to its Items.
  const { data: queued, error } = await supabase.rpc("queue_extractions", {
    p_image_ids: images.map((i) => i.id),
    p_prompt_version: PROMPT_VERSION,
  });
  if (error) return { error: `Could not queue the images: ${error.message}` };
  const ids = new Set((queued ?? []) as string[]);

  // 3. Read them after the response is sent, so the Consultant can leave. The per-minute cron
  //    (app/api/cron/extract) picks up anything this run does not get to.
  after(() => readQueued(supabase, images.filter((i) => ids.has(i.id)), START_BUDGET_MS));

  revalidatePath("/", "layout");
  return ids.size === 0
    ? { message: "Nothing new to send. The remaining images are already being read." }
    : { message: `${ids.size} sent to be read. You can leave this page; Items appear as each image is done.` };
}
