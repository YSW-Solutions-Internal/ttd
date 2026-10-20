import Anthropic from "@anthropic-ai/sdk";
import {
  CLASSIFIER_PROMPT,
  IMAGE_TYPES,
  extractionPromptFor,
  type ImageType,
} from "./prompts";
import { parseModelJson, toExtractionResult } from "./parse";
import type { ExtractionResult } from "./types";

export const MODEL = "claude-sonnet-5-5";

export type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type ImageExtraction = ExtractionResult & { imageType: ImageType; model: string };

/** One request to Claude: the image first, then the instructions (the order Anthropic recommends). */
async function askAboutImage(
  client: Anthropic,
  mediaType: MediaType,
  base64: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  if (res.stop_reason === "max_tokens") {
    throw new Error("The model's answer was cut off before it finished (too much on one image).");
  }
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Step 1: classify the image. Step 2: extract with the prompt for that type.
 * Throws on any failure so the caller can record it. Nothing is ever guessed.
 */
export async function extractFromImage(
  bytes: Uint8Array,
  mediaType: MediaType,
): Promise<ImageExtraction> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const base64 = Buffer.from(bytes).toString("base64");

  // 1. Classify
  const classText = await askAboutImage(client, mediaType, base64, CLASSIFIER_PROMPT, 100);
  const classified = (parseModelJson(classText) as { image_type?: string } | null)?.image_type;
  const imageType: ImageType = (IMAGE_TYPES as readonly string[]).includes(classified ?? "")
    ? (classified as ImageType)
    : "UNKNOWN";

  // 2. Extract. An UNKNOWN image still gets the generic prompt; if it holds
  // nothing useful the answer is simply an empty items list, which the screen shows.
  const extractText = await askAboutImage(
    client,
    mediaType,
    base64,
    extractionPromptFor(imageType),
    8192,
  );
  const result = toExtractionResult(parseModelJson(extractText));

  return { ...result, imageType, model: MODEL };
}
