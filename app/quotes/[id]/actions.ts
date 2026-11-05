"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/hash";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_TEXT } from "@/lib/files";

/** What happened to one uploaded image; anything else is why it was not uploaded. */
export type UploadOutcome = "added" | "restored" | "duplicate" | { rejected: string };

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** One image per call (the form sends them one by one), so each request stays under Vercel's limit. */
export async function uploadImage(quoteId: string, formData: FormData): Promise<UploadOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { rejected: "no file" };
  if (!ALLOWED.has(file.type)) return { rejected: "only PNG, JPG or WebP" };
  if (file.size > MAX_UPLOAD_BYTES) return { rejected: `over ${MAX_UPLOAD_TEXT}` };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = sha256Hex(bytes);

  // Duplicate check: same quote, same bytes.
  const { data: existing } = await supabase
    .from("images")
    .select("id, removed_at")
    .eq("quote_id", quoteId)
    .eq("sha256", hash)
    .maybeSingle();

  if (existing) {
    if (!existing.removed_at) return "duplicate";
    // Previously removed: bring it back, keeping its stored extraction.
    const { data: back } = await supabase.from("images").update({ removed_at: null }).eq("id", existing.id).select("id");
    // RLS filters rather than errors, so zero rows means it was refused.
    if (!back?.length) return { rejected: "could not restore" };
    revalidatePath("/", "layout");
    return "restored";
  }

  const path = `${quoteId}/images/${hash}.${EXT[file.type]}`;
  const { error: upErr } = await supabase.storage
    .from("quote-files")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr && !/already exists|Duplicate/i.test(upErr.message)) return { rejected: "upload failed" };

  const { error: insErr } = await supabase.from("images").insert({
    quote_id: quoteId,
    storage_path: path,
    filename: file.name,
    sha256: hash,
    size_bytes: file.size,
    uploaded_by: user.id,
  });
  if (insErr) return { rejected: "could not save" };

  revalidatePath("/", "layout");
  return "added";
}

export async function removeImage(quoteId: string, imageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Soft remove: the extraction and any corrections stay in the database.
  const { data, error } = await supabase
    .from("images")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", imageId)
    .eq("quote_id", quoteId)
    .select("id");
  if (error) throw new Error(`Could not remove the image: ${error.message}`);
  if (!data?.length) throw new Error("Could not remove the image: you cannot edit this Quote.");

  revalidatePath("/", "layout");
}
