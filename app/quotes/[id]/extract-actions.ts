"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MODEL, answerToResult, extractFromImage, type ClaudeCall, type MediaType } from "@/lib/extraction/claude";
import { PROMPT_VERSION } from "@/lib/extraction/prompts";
import { priceRows, toItemRows } from "@/lib/extraction/rows";
import { countriesOf, loadFeeContext, loadPlaces, type FeeContext } from "@/lib/fee-context";
import type { ExtractionResult } from "@/lib/extraction/types";

export type ExtractState = { message?: string; error?: string };

const CONCURRENCY = 3; // images sent to Claude at the same time
// shortcut: extraction runs inside the request (maxDuration 300 s, page.tsx). No new image starts after
// START_BUDGET_MS (the rest wait for the next click), and every Claude call must end by CALL_DEADLINE_MS,
// leaving time to store what was read. Background jobs replace this (README milestone 2).
const START_BUDGET_MS = 140_000;
const CALL_DEADLINE_MS = 270_000;

function mediaTypeFor(path: string): MediaType {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg"; // jpg / jpeg
}

type ImageRow = { id: string; filename: string; storage_path: string };

/** Call Claude once and log the call to ai_calls (ADR 0005), whether it worked or not. */
async function callAndLog(
  supabase: SupabaseClient,
  imageId: string,
  bytes: Uint8Array,
  mediaType: MediaType,
  deadline: number,
): Promise<ExtractionResult> {
  const startedAt = new Date().toISOString();
  let call: ClaudeCall | null = null;
  let error: string | null = null;
  try {
    call = await extractFromImage(bytes, mediaType, deadline - Date.now());
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
async function processImage(
  supabase: SupabaseClient,
  quoteId: string,
  ctx: FeeContext,
  image: ImageRow,
  deadline: number,
): Promise<"done" | "failed" | "busy"> {

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
    const result = await callAndLog(supabase, image.id, bytes, mediaTypeFor(image.storage_path), deadline);

    const rows = toItemRows(quoteId, image.id, result.items, ctx.createdOn);
    const places = await loadPlaces(supabase, rows.flights.flatMap((f) => [f.from_code, f.to_code]));
    priceRows(rows, ctx.stays, ctx.rates, places);

    // Writes the Items and marks the image done in one transaction (migration 0009).
    const { error: storeErr } = await supabase.rpc("store_extraction", {
      p_image_id: image.id,
      p_source_type: result.source?.type ?? null,
      p_rows: rows,
    });
    if (storeErr) throw new Error(`Could not save what was read: ${storeErr.message}`);
    return "done";
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("extractions")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("image_id", image.id);
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

  // 4. Work through them a few at a time: each worker takes the next image as soon as it is free.
  const ctx = await loadFeeContext(supabase, quoteId);
  const started = Date.now();
  const queue = [...todo];
  const count = { done: 0, failed: 0, busy: 0 };
  async function worker() {
    while (queue.length > 0 && Date.now() - started < START_BUDGET_MS) {
      count[await processImage(supabase, quoteId, ctx, queue.shift()!, started + CALL_DEADLINE_MS)]++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const { done: ok, failed, busy } = count;

  revalidatePath(`/quotes/${quoteId}`);

  const skipped = images.length - todo.length;
  const parts = [`${ok} extracted`];
  if (skipped) parts.push(`${skipped} skipped (already processed)`);
  if (busy) parts.push(`${busy} skipped (already being extracted)`);
  if (queue.length) parts.push(`${queue.length} not started in time (click Extract data again)`);
  if (failed) {
    return { message: parts.join(", "), error: `${failed} failed. See the error under each image.` };
  }
  return { message: parts.join(", ") };
}
