"use client";

import { useActionState } from "react";
import { FileDrop } from "@/app/file-drop";
import { Msg } from "@/app/ui";
import { uploadImages, type UploadState } from "./actions";

export function UploadForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadImages.bind(null, quoteId),
    {},
  );

  return (
    <form action={action} className="rounded-md border border-line bg-white p-4">
      <label htmlFor="images">Add supplier screenshots (PNG, JPG or WebP, up to 7 MB each)</label>
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
