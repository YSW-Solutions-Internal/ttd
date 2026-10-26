"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { assembleQuote, problems, type AssembleInput } from "@/lib/pdf/assemble";
import { renderQuotePdf } from "@/lib/pdf/render";
import type { QuoteJson } from "@/lib/pdf/types";

export type PdfState = { error?: string; problems?: string[] };

const ITEM_TABLES = [
  "flight_options",
  "accommodation_options",
  "transfers",
  "rail_journeys",
  "car_rentals",
  "excursions",
] as const;

/** Renders the frozen JSON, uploads the PDF and records its path. Throws on failure. */
async function storePdf(supabase: SupabaseClient, quoteId: string, versionId: string, versionNo: number, quote: QuoteJson) {
  // The frozen reference is the Trip's (docs/adr/0007).
  const path = `${quoteId}/pdf/${quote.reference}-v${versionNo}.pdf`;
  const pdf = await renderQuotePdf(quote);
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
}

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
    .select("id, version_no, assembled, pdf_path")
    .eq("id", versionId)
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (!version) return { error: "Version not found." };
  if (version.pdf_path) return {};
  if (!version.assembled) return { error: "This version has no quote data to render." };

  try {
    await storePdf(supabase, quoteId, versionId, version.version_no, version.assembled as QuoteJson);
  } catch (e) {
    console.error("PDF render failed:", versionId, e);
    return { error: e instanceof Error ? e.message : "PDF render failed." };
  }

  revalidatePath(`/quotes/${quoteId}`);
  return {};
}

/**
 * Generate version (GLOSSARY): check, assemble the Working content in code, freeze it with its
 * Items as the next Version, then render its PDF. A failed PDF leaves the Version for Retry.
 */
export async function generateVersion(quoteId: string, _prev: PdfState): Promise<PdfState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, trips(id, reference, title, starts_on, ends_on, nights, adults, children, visa_info, health_info, insurance_info, terms_profile, custom_notes, clients(client_code, full_name, profiles!clients_consultant_id_fkey(full_name, email)))",
    )
    .eq("id", quoteId)
    .maybeSingle();
  const trip = one(quote?.trips) as Record<string, any> | null;
  if (!quote || !trip) return { error: "Quote not found." };
  const client = one(trip.clients) as Record<string, any> | null;
  const consultant = one(client?.profiles) as { full_name: string | null; email: string } | null;

  const [{ data: active }, { data: stays }, ...tables] = await Promise.all([
    supabase.from("quote_items").select("entity_id").eq("quote_id", quoteId),
    supabase.from("trip_stops").select("*").eq("trip_id", trip.id).order("position"),
    ...ITEM_TABLES.map((t) => supabase.from(t).select("*").eq("quote_id", quoteId).order("created_at")),
  ]);
  const failed = tables.find((t) => t.error);
  if (failed) return { error: `Could not load the Items: ${failed.error!.message}` };

  // quote_items leaves out Items whose image was removed.
  const keep = new Set((active ?? []).map((r) => r.entity_id));
  const items = Object.fromEntries(
    ITEM_TABLES.map((t, i) => [t, (tables[i].data ?? []).filter((r) => keep.has(r.entity_id))]),
  ) as Omit<AssembleInput["items"], "flights">;

  const blockers = problems({ ...items, flights: [] });
  if (blockers.length > 0) return { problems: blockers };

  const optionIds = items.flight_options.map((o) => o.id);
  const { data: flights } = optionIds.length
    ? await supabase.from("flights").select("*").in("flight_option_id", optionIds)
    : { data: [] };
  const codes = [...new Set((flights ?? []).map((f) => String(f.airline ?? "").toUpperCase()).filter(Boolean))];
  const { data: airlines } = codes.length
    ? await supabase.from("airlines").select("iata, name").in("iata", codes).eq("confirmed", true)
    : { data: [] };

  const { quote: json, items: versionItems } = assembleQuote({
    today: new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }),
    reference: trip.reference,
    consultant: { name: consultant?.full_name || consultant?.email || "", email: consultant?.email },
    client: { name: client?.full_name ?? "", code: client?.client_code ?? "" },
    trip,
    stays: stays ?? [],
    items: { ...items, flights: flights ?? [] },
    airlines: new Map((airlines ?? []).map((a) => [a.iata, a.name])),
  });

  const { data: versionId, error } = await supabase.rpc("generate_version", {
    p_quote_id: quoteId,
    p_assembled: json,
    p_items: versionItems,
  });
  if (error || !versionId) {
    return {
      error: /duplicate key|unique/i.test(error?.message ?? "")
        ? "Someone generated a version at the same moment. Refresh and try again."
        : `Could not save the version: ${error?.message ?? "unknown error"}`,
    };
  }

  // The Version now exists; read back its frozen JSON (with " V<n>") and number to render.
  revalidatePath(`/quotes/${quoteId}`);
  const { data: version } = await supabase
    .from("quote_versions")
    .select("version_no, assembled")
    .eq("id", versionId)
    .single();
  try {
    await storePdf(supabase, quoteId, versionId, version!.version_no, version!.assembled as QuoteJson);
  } catch (e) {
    console.error("PDF render failed:", versionId, e);
    return { error: "The version was saved, but its PDF failed. Use Retry in the Versions table." };
  }
  return {};
}
