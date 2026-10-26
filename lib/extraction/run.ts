import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL, answerToResult, extractFromImage, type ClaudeCall, type MediaType } from "@/lib/extraction/claude";
import { PROMPT_VERSION } from "@/lib/extraction/prompts";
import { priceRows, toItemRows } from "@/lib/extraction/rows";
import { loadFeeContext, loadPlaces, type FeeContext } from "@/lib/fee-context";
import type { ExtractionResult } from "@/lib/extraction/types";

export type QueuedImage = { id: string; quote_id: string; storage_path: string };

const CONCURRENCY = 3; // images sent to Claude at the same time
// Every image must be stored well within the 5-minute lock in claim_extraction (migration 0017),
// or a cron run could take it over while it is still being read.
const CALL_MS = 240_000;

function mediaTypeFor(path: string): MediaType {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg"; // jpg / jpeg
}

/** Call Claude once and log the call to ai_calls (ADR 0005), whether it worked or not. */
async function callAndLog(
  supabase: SupabaseClient,
  imageId: string,
  bytes: Uint8Array,
  mediaType: MediaType,
): Promise<ExtractionResult> {
  const startedAt = new Date().toISOString();
  let call: ClaudeCall | null = null;
  let error: string | null = null;
  try {
    call = await extractFromImage(bytes, mediaType, CALL_MS);
    return answerToResult(call);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
    throw e;
  } finally {
    const { error: logErr } = await supabase.from("ai_calls").insert({
      image_id: imageId,
      prompt_version: PROMPT_VERSION,
      model: call?.model ?? MODEL,
      started_at: startedAt,
      stop_reason: call?.stopReason ?? null,
      input_tokens: call?.inputTokens ?? null,
      output_tokens: call?.outputTokens ?? null,
      raw_output: call?.text ?? null,
      error,
    });
    // The log is for debugging only; losing a row must not fail the image.
    if (logErr) console.error("ai_calls insert failed:", imageId, logErr.message);
  }
}

/** Process one image start to finish and record the outcome. Never throws. */
async function processImage(supabase: SupabaseClient, ctx: FeeContext, image: QueuedImage): Promise<void> {
  // Mark as running, atomically: if another run already has this image, finished it
  // meanwhile, or it failed and was not queued again, leave it alone.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_extraction", {
    p_image_id: image.id,
    p_prompt_version: PROMPT_VERSION,
    p_model: MODEL,
  });
  if (claimErr) {
    console.error("claim_extraction failed:", image.id, claimErr.message);
    return;
  }
  if (!claimed) return;

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("quote-files")
      .download(image.storage_path);
    if (dlErr || !blob) throw new Error("Could not read the image from storage.");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await callAndLog(supabase, image.id, bytes, mediaTypeFor(image.storage_path));

    const rows = toItemRows(image.quote_id, image.id, result.items, ctx.createdOn);
    const places = await loadPlaces(supabase, rows.flights.flatMap((f) => [f.from_code, f.to_code]));
    priceRows(rows, ctx.stays, ctx.rates, places);

    // Writes the Items and marks the image done in one transaction (migration 0009).
    const { error: storeErr } = await supabase.rpc("store_extraction", {
      p_image_id: image.id,
      p_source_type: result.source?.type ?? null,
      p_rows: rows,
    });
    if (storeErr) throw new Error(`Could not save what was read: ${storeErr.message}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("extractions")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("image_id", image.id);
  }
}

/**
 * Read queued images a few at a time, any Quotes mixed. No new image starts after
 * startBudgetMs; whatever is left stays queued for the next cron run.
 */
export async function readQueued(supabase: SupabaseClient, images: QueuedImage[], startBudgetMs: number) {
  const contexts = new Map<string, Promise<FeeContext>>();
  const started = Date.now();
  const queue = [...images];
  async function worker() {
    while (queue.length > 0 && Date.now() - started < startBudgetMs) {
      const image = queue.shift()!;
      if (!contexts.has(image.quote_id)) contexts.set(image.quote_id, loadFeeContext(supabase, image.quote_id));
      try {
        await processImage(supabase, await contexts.get(image.quote_id)!, image);
      } catch (e) {
        // Only loadFeeContext can throw here; the image stays queued and the next cron run tries again.
        console.error("extraction skipped:", image.id, e instanceof Error ? e.message : e);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
