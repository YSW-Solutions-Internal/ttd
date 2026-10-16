"use client";

import { useActionState } from "react";
import { uploadImages, type UploadState } from "./actions";

export function UploadForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadImages.bind(null, quoteId),
    {},
  );

  return (
    <form action={action} className="card">
      <label htmlFor="images">Add supplier screenshots (PNG, JPG or WebP, up to 10 MB each)</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
        <button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
      {state.message && <div className="msg">{state.message}</div>}
      {state.error && <div className="msg error">{state.error}</div>}
    </form>
  );
}
