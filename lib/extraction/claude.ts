import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT } from "./prompts";
import { parseAnswer, toExtractionResult } from "./parse";
import type { ExtractionResult } from "./types";

export const MODEL = "claude-sonnet-5-5";

export type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** One call to Claude, as returned: what the caller logs to ai_calls (ADR 0005). */
export type ClaudeCall = {
  model: string;
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
};

/**
 * One call per image (ADR 0003): the answer is forced into EXTRACTION_SCHEMA.
 * Returns the raw answer for logging; answerToResult() then checks and parses it.
 * Throws only if the API call itself fails.
 */
export async function extractFromImage(
  bytes: Uint8Array,
  mediaType: MediaType,
): Promise<ClaudeCall> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // a safety decline is retried on another model instead of failing the image
    // The prompt is identical on every call, so it is cached; the image follows it.
    system: [{ type: "text", text: EXTRACTION_PROMPT, cache_control: { type: "ephemeral" } }],
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

  return {
    model: res.model,
    text: res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(""),
    stopReason: res.stop_reason,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

/** Throws on an unusable answer so the caller can record it. Nothing is ever guessed. */
export function answerToResult(call: ClaudeCall): ExtractionResult {
  if (call.stopReason === "max_tokens") {
    throw new Error("The model's answer was cut off before it finished (too much on one image).");
  }
  if (call.stopReason === "refusal") {
    throw new Error("The model declined to read this image.");
  }
  return toExtractionResult(parseAnswer(call.text));
}
