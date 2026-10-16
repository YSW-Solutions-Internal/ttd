import { createHash } from "node:crypto";

/** SHA-256 of the file bytes, as hex. Identical screenshots always give the same hash. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
