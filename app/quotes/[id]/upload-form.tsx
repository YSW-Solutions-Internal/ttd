"use client";

import { useActionState } from "react";
import { FileDrop } from "@/app/file-drop";
import { Msg } from "@/app/ui";
import { MAX_UPLOAD_TEXT } from "@/lib/files";
import { uploadImage } from "./actions";

type UploadState = { message?: string; error?: string };

export function UploadForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(async (_prev, formData) => {
    const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: "Choose at least one image." };

    let added = 0;
    let restored = 0;
    const skipped: string[] = [];
    const rejected: string[] = [];
    // One request per image: Vercel refuses a request over 4.5 MB, so several at once could fail.
    for (const file of files) {
      const one = new FormData();
      one.append("image", file);
      const outcome = await uploadImage(quoteId, one);
      if (outcome === "added") added++;
      else if (outcome === "restored") restored++;
      else if (outcome === "duplicate") skipped.push(file.name);
      else rejected.push(`${file.name} (${outcome.rejected})`);
    }

    const parts: string[] = [];
    if (added) parts.push(`${added} added`);
    if (restored) parts.push(`${restored} restored`);
    if (skipped.length) parts.push(`${skipped.length} skipped as duplicates (${skipped.join(", ")})`);
    const message = parts.join(", ") || undefined;
    return rejected.length ? { message, error: `Not uploaded: ${rejected.join("; ")}` } : { message };
  }, {});

  return (
    <form action={action} className="rounded-md border border-line bg-white p-4">
      <label htmlFor="images">Add supplier screenshots (PNG, JPG or WebP, up to {MAX_UPLOAD_TEXT} each)</label>
      <div className="flex flex-wrap items-center gap-3">
        <FileDrop id="images" name="images" accept="image/png,image/jpeg,image/webp" multiple />
        <button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      {state.message && <Msg className="mt-2.5">{state.message}</Msg>}
      {state.error && <Msg tone="error" className="mt-2.5">{state.error}</Msg>}
    </form>
  );
}
