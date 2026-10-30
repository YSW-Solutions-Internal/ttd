"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/hash";

export type UploadState = { message?: string; error?: string };

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
// Claude accepts images up to 10 MB once base64-encoded (about 33% bigger), so cap uploads at 7 MB.
const MAX_BYTES = 7 * 1024 * 1024;

export async function uploadImages(
  quoteId: string,
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one image." };

  let added = 0;
  let restored = 0;
  const skipped: string[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      rejected.push(`${file.name} (only PNG, JPG or WebP)`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      rejected.push(`${file.name} (over 7 MB)`);
      continue;
    }

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
      if (existing.removed_at) {
        // Previously removed: bring it back, keeping its stored extraction.
        await supabase.from("images").update({ removed_at: null }).eq("id", existing.id);
        restored++;
      } else {
        skipped.push(file.name);
      }
      continue;
    }

    const path = `${quoteId}/images/${hash}.${EXT[file.type]}`;
    const { error: upErr } = await supabase.storage
      .from("quote-files")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr && !/already exists|Duplicate/i.test(upErr.message)) {
      rejected.push(`${file.name} (upload failed)`);
      continue;
    }

    const { error: insErr } = await supabase.from("images").insert({
      quote_id: quoteId,
      storage_path: path,
      filename: file.name,
      sha256: hash,
      size_bytes: file.size,
      uploaded_by: user.id,
    });
    if (insErr) {
      rejected.push(`${file.name} (could not save)`);
      continue;
    }
    added++;
  }

  revalidatePath("/", "layout");

  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (restored) parts.push(`${restored} restored`);
  if (skipped.length) parts.push(`${skipped.length} skipped as duplicates (${skipped.join(", ")})`);
  const message = parts.join(", ");
  if (rejected.length) {
    return { message: message || undefined, error: `Not uploaded: ${rejected.join("; ")}` };
  }
  return { message };
}

export async function removeImage(quoteId: string, imageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Soft remove: the extraction and any corrections stay in the database.
  const { error } = await supabase
    .from("images")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", imageId)
    .eq("quote_id", quoteId);
  if (error) throw new Error(`Could not remove the image: ${error.message}`);

  revalidatePath("/", "layout");
}
