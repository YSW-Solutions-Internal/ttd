"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { renderQuotePdf } from "@/lib/pdf/render";
import type { QuoteJson } from "@/lib/pdf/types";

export type PdfState = { error?: string };

/**
 * Renders a Version's PDF from its frozen quote JSON and records where it's stored.
 * Used to retry a PDF that failed; never re-renders a Version that already has one (docs/adr/0006).
 */
export async function renderVersionPdf(quoteId: string, versionId: string, _prev: PdfState): Promise<PdfState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: version } = await supabase
    .from("quote_versions")
    .select("id, version_no, assembled, pdf_path, quotes(reference)")
    .eq("id", versionId)
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (!version) return { error: "Version not found." };
  if (version.pdf_path) return {};
  if (!version.assembled) return { error: "This version has no quote data to render." };

  const path = `${quoteId}/pdf/${one(version.quotes)?.reference}-v${version.version_no}.pdf`;

  try {
    const pdf = await renderQuotePdf(version.assembled as QuoteJson);
    const { error: upErr } = await supabase.storage
      .from("quote-files")
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
    // A file already there came from an earlier attempt at this same frozen JSON, so it's the same PDF.
    if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error(`Upload failed: ${upErr.message}`);

    const { error: dbErr } = await supabase
      .from("quote_versions")
      .update({ pdf_path: path })
      .eq("id", versionId)
      .is("pdf_path", null);
    if (dbErr) throw new Error(`Could not record the PDF: ${dbErr.message}`);
  } catch (e) {
    console.error("PDF render failed:", versionId, e);
    return { error: e instanceof Error ? e.message : "PDF render failed." };
  }

  revalidatePath(`/quotes/${quoteId}`);
  return {};
}
