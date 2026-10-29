"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FieldParseError } from "@/lib/form-values";
import { parseInvoice, parseLinkAmount, type InvoiceStatus, type Side } from "@/lib/invoicing";

// Who may do what is decided by the database (migration 0024): the Trip's status and
// Consultant for adding, Accountants and Administrators for status, Administrators after Verified.

export type InvoiceFormState = { error?: string; notice?: string };

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const failed = (e: unknown): InvoiceFormState => ({
  error: e instanceof FieldParseError || e instanceof Error ? e.message : "Could not read the form.",
});

const done = (tripId: string) => {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/quotes/[id]", "page");
};

export async function addInvoice(tripId: string, side: Side, _prev: InvoiceFormState, fd: FormData): Promise<InvoiceFormState> {
  const supabase = await createClient();
  try {
    const v = parseInvoice(fd, side);
    const supplierId = String(fd.get("supplier_id") ?? "");
    if (side === "supplier" && !supplierId) return { error: "Choose the Supplier." };
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Attach the invoice PDF." };
    if (file.type !== "application/pdf") return { error: "Only PDF files." };
    if (file.size > MAX_PDF_BYTES) return { error: "The PDF is over 10 MB." };

    const path = `${tripId}/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage.from("invoice-files").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { error: `Could not upload the PDF: ${upErr.message}` };

    const { error } = await supabase.from("invoices").insert({
      ...v,
      trip_id: tripId,
      side,
      file_path: path,
      supplier_id: side === "supplier" ? supplierId : null,
      status: side === "supplier" ? "received" : null,
    });
    // shortcut: a refused insert leaves the uploaded PDF behind (only admins delete files); purge orphans if it adds up.
    if (error) {
      if (error.code === "23505") return { error: `Invoice ${v.number} is already here${side === "supplier" ? " for this Supplier" : ""}.` };
      if (error.code === "42501") return { error: "Only the Client's Consultant or an Administrator can add invoices until the Trip is Booked." };
      return { error: `Could not save: ${error.message}` };
    }
  } catch (e) {
    return failed(e);
  }
  done(tripId);
  return { notice: "Invoice added." };
}

export async function deleteInvoice(tripId: string, invoiceId: string, _prev: InvoiceFormState): Promise<InvoiceFormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").delete().eq("id", invoiceId).select("id");
  if (error) return { error: `Could not delete: ${error.message}` };
  if (!data?.length) return { error: "Could not delete: you cannot change this invoice." };
  done(tripId);
  return {};
}

/** Links part of an invoice to a booked Item ("entityId") or one of its Changes ("entityId|changeId"). */
export async function addLink(
  tripId: string,
  invoiceId: string,
  quoteId: string,
  credit: boolean,
  _prev: InvoiceFormState,
  fd: FormData,
): Promise<InvoiceFormState> {
  const supabase = await createClient();
  try {
    const [entityId, changeId] = String(fd.get("target") ?? "").split("|");
    if (!entityId) return { error: "Choose what this invoice is for." };
    const amount = parseLinkAmount(String(fd.get("amount") ?? ""), credit);
    const { error } = await supabase
      .from("invoice_links")
      .insert({ invoice_id: invoiceId, quote_id: quoteId, entity_id: entityId, change_id: changeId || null, amount });
    if (error) {
      if (error.code === "23505") return { error: "This invoice is already linked to that; remove the link to change its amount." };
      if (error.code === "42501") return { error: "You cannot change this invoice." };
      return { error: error.message };
    }
  } catch (e) {
    return failed(e);
  }
  done(tripId);
  return {};
}

export async function removeLink(tripId: string, linkId: string, _prev: InvoiceFormState): Promise<InvoiceFormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoice_links").delete().eq("id", linkId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You cannot change this invoice." };
  done(tripId);
  return {};
}

/** Verify, Query (with a reason) or back to Received; the database checks who, and that Verify adds up. */
export async function setInvoiceStatus(
  tripId: string,
  invoiceId: string,
  status: InvoiceStatus,
  _prev: InvoiceFormState,
  fd: FormData,
): Promise<InvoiceFormState> {
  const reason = String(fd.get("query_reason") ?? "").trim();
  if (status === "query" && !reason) return { error: "Say what is wrong with the invoice." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status, query_reason: status === "query" ? reason : null })
    .eq("id", invoiceId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You cannot change this invoice." };
  done(tripId);
  return { notice: status === "verified" ? "Verified." : status === "query" ? "In Query." : "Back to Received." };
}

/** An Accountant marks that a booking or Change will get no Supplier invoice (or undoes it). */
export async function setNoSupplierInvoice(
  tripId: string,
  quoteId: string,
  entityId: string,
  changeId: string | null,
  value: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_no_supplier_invoice", {
    p_quote_id: quoteId,
    p_entity_id: entityId,
    p_change_id: changeId,
    p_value: value,
  });
  if (error) throw new Error(error.message);
  done(tripId);
}
