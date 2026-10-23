import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT } from "./prompts";
import { EXTRACTION_SCHEMA } from "./schema";
import { toExtractionResult } from "./parse";
import type { ExtractionResult } from "./types";

export const MODEL = "claude-sonnet-5-5";

export type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type ImageExtraction = ExtractionResult & { model: string };

/**
 * One call per image (ADR 0003): the answer is forced into EXTRACTION_SCHEMA.
 * Throws on any failure so the caller can record it. Nothing is ever guessed.
 */
export async function extractFromImage(
  bytes: Uint8Array,
  mediaType: MediaType,
): Promise<ImageExtraction> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // a safety decline is retried on another model instead of failing the image
    // The prompt is identical on every call, so it is cached; the image follows it.
    system: [{ type: "text", text: EXTRACTION_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") },
          },
          { type: "text", text: "Extract this image." },
        ],
      },
    ],
  });

  if (res.stop_reason === "max_tokens") {
    throw new Error("The model's answer was cut off before it finished (too much on one image).");
  }
  if (res.stop_reason === "refusal") {
    throw new Error("The model declined to read this image.");
  }
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { ...toExtractionResult(JSON.parse(text)), model: res.model };
}
