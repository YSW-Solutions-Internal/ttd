"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MODEL, extractFromImage, type MediaType } from "@/lib/extraction/claude";
import { PROMPT_VERSION } from "@/lib/extraction/prompts";

export type ExtractState = { message?: string; error?: string };

const CONCURRENCY = 3; // images sent to Claude at the same time

function mediaTypeFor(path: string): MediaType {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg"; // jpg / jpeg
}

type ImageRow = { id: string; filename: string; storage_path: string };

/** Process one image start to finish and record the outcome. Never throws. */
async function processImage(
  supabase: SupabaseClient,
  image: ImageRow,
): Promise<"done" | "failed" | "busy"> {
  const key = { image_id: image.id, prompt_version: PROMPT_VERSION };

  // Mark as running, atomically (claim_extraction in migration 0006): if another
  // run already has this image, or finished it meanwhile, leave it alone.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_extraction", {
    p_image_id: image.id,
    p_prompt_version: PROMPT_VERSION,
    p_model: MODEL,
  });
  if (claimErr) {
    console.error("claim_extraction failed:", image.id, claimErr.message);
    return "failed";
  }
  if (!claimed) return "busy";

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("quote-files")
      .download(image.storage_path);
    if (dlErr || !blob) throw new Error("Could not read the image from storage.");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await extractFromImage(bytes, mediaTypeFor(image.storage_path));

    await supabase
      .from("extractions")
      .update({
        status: "done",
        image_type: result.source?.type ?? null,
        model: result.model,
        result: { items: result.items, source: result.source },
        error: null,
      })
      .match(key);
    return "done";
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("extractions")
      .update({ status: "failed", error: message.slice(0, 500) })
      .match(key);
    return "failed";
  }
}

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
    .select("id, filename, storage_path")
    .eq("quote_id", quoteId)
    .is("removed_at", null);
  if (!images || images.length === 0) return { error: "Add at least one image first." };

  // 2. Which of them already have a finished extraction, made with any prompt version?
  const { data: finished } = await supabase
    .from("extractions")
    .select("image_id")
    .in(
      "image_id",
      images.map((i) => i.id),
    )
    .eq("status", "done");
  const alreadyDone = new Set((finished ?? []).map((f) => f.image_id));

  // 3. Only the rest go to the AI. An image is read once; a later prompt change does not re-read it,
  //    because staff corrections are keyed to the Items of its stored extraction.
  const todo = images.filter((i) => !alreadyDone.has(i.id));
  if (todo.length === 0) {
    return { message: `Nothing new to extract. All ${images.length} images were already processed.` };
  }

  // 4. Work through them a few at a time.
  let ok = 0;
  let failed = 0;
  let busy = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(batch.map((img) => processImage(supabase, img)));
    ok += outcomes.filter((o) => o === "done").length;
    failed += outcomes.filter((o) => o === "failed").length;
    busy += outcomes.filter((o) => o === "busy").length;
  }

  revalidatePath(`/quotes/${quoteId}`);

  const skipped = images.length - todo.length;
  const parts = [`${ok} extracted`];
  if (skipped) parts.push(`${skipped} skipped (already processed)`);
  if (busy) parts.push(`${busy} skipped (already being extracted)`);
  if (failed) {
    return { message: parts.join(", "), error: `${failed} failed. See the error under each image.` };
  }
  return { message: parts.join(", ") };
}
