"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FieldParseError } from "@/lib/form-values";
import { parseBooking, parseChange, ticketNumbers, type BookingValues } from "@/lib/booking";

export type BookingFormState = { error?: string; notice?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const failed = (e: unknown): BookingFormState => ({
  error: e instanceof FieldParseError || e instanceof Error ? e.message : "Could not read the form.",
});

/** The Supplier named, from the shared list; a name not on it is added (any User may add one). */
async function supplierId(supabase: Supabase, name: string): Promise<string> {
  const key = name.toLowerCase();
  // shortcut: reads the whole list; filter in SQL once there are thousands of Suppliers.
  const { data } = await supabase.from("suppliers").select("id, name");
  const found = data?.find((s) => s.name.trim().toLowerCase() === key);
  if (found) return found.id;
  const { data: added, error } = await supabase.from("suppliers").insert({ name }).select("id").single();
  if (error || !added) throw new Error(`Could not add the Supplier: ${error?.message}`);
  return added.id;
}

async function bookingRow(supabase: Supabase, v: BookingValues) {
  const { supplier, ...rest } = v;
  return { ...rest, supplier_id: await supplierId(supabase, supplier) };
}

/** Flights are issued with their ticket numbers (GLOSSARY: Issued). */
function issuedAt(kind: string, fd: FormData, tickets: string[]): string | null {
  if (fd.get("issued") !== "on") return null;
  if (kind === "flight" && tickets.length === 0) throw new Error("A flight is issued with its ticket numbers.");
  return new Date().toISOString();
}

export async function bookItem(
  quoteId: string,
  entityId: string,
  kind: string,
  _prev: BookingFormState,
  fd: FormData,
): Promise<BookingFormState> {
  const supabase = await createClient();
  try {
    const v = parseBooking(fd);
    const row = { ...(await bookingRow(supabase, v)), quote_id: quoteId, entity_id: entityId, kind, issued_at: issuedAt(kind, fd, v.ticket_numbers) };
    const { error } = await supabase.from("item_bookings").insert(row);
    if (error) return { error: error.code === "23505" ? "This Item is already booked." : `Could not book: ${error.message}` };
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/quotes/${quoteId}`);
  return { notice: "Booked." };
}

/** A Correction: fixes booking details typed wrong. History keeps what they were. */
export async function correctBooking(
  quoteId: string,
  entityId: string,
  _prev: BookingFormState,
  fd: FormData,
): Promise<BookingFormState> {
  const supabase = await createClient();
  try {
    const row = await bookingRow(supabase, parseBooking(fd));
    const { data, error } = await supabase.from("item_bookings").update(row).eq("quote_id", quoteId).eq("entity_id", entityId).select("entity_id");
    if (error) return { error: `Could not save: ${error.message}` };
    if (!data?.length) return { error: "Could not save: you cannot correct this booking." };
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/quotes/${quoteId}`);
  return { notice: "Corrected." };
}

export async function markIssued(
  quoteId: string,
  entityId: string,
  kind: string,
  _prev: BookingFormState,
  fd: FormData,
): Promise<BookingFormState> {
  const supabase = await createClient();
  const tickets = ticketNumbers(String(fd.get("ticket_numbers") ?? ""));
  try {
    fd.set("issued", "on");
    const at = issuedAt(kind, fd, tickets);
    const { data, error } = await supabase
      .from("item_bookings")
      .update({ issued_at: at, ...(tickets.length ? { ticket_numbers: tickets } : {}) })
      .eq("quote_id", quoteId)
      .eq("entity_id", entityId)
      .select("entity_id");
    if (error) return { error: `Could not save: ${error.message}` };
    if (!data?.length) return { error: "Could not save: you cannot change this booking." };
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/quotes/${quoteId}`);
  return { notice: "Issued." };
}

/** Undoes a booking made by mistake; refused once it has Changes or invoices. */
export async function unbookItem(quoteId: string, entityId: string, _prev: BookingFormState): Promise<BookingFormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("item_bookings").delete().eq("quote_id", quoteId).eq("entity_id", entityId).select("entity_id");
  // 23503: a Change or an invoice still points at the booking.
  if (error) return { error: error.code === "23503" ? "This Item has Changes or invoices, so it cannot be unbooked. Record a Cancellation instead." : `Could not unbook: ${error.message}` };
  if (!data?.length) return { error: "Could not unbook: you cannot change this booking." };
  revalidatePath(`/quotes/${quoteId}`);
  return {};
}

export async function addChange(
  quoteId: string,
  entityId: string,
  kind: "change" | "cancellation",
  _prev: BookingFormState,
  fd: FormData,
): Promise<BookingFormState> {
  const supabase = await createClient();
  try {
    const row = { ...parseChange(fd, kind === "cancellation" ? "cancellation" : "change"), quote_id: quoteId, entity_id: entityId };
    const { error } = await supabase.from("item_changes").insert(row);
    if (error) return { error: error.code === "23505" ? "This Item is already cancelled." : `Could not save: ${error.message}` };
  } catch (e) {
    return failed(e);
  }
  revalidatePath(`/quotes/${quoteId}`);
  return { notice: kind === "cancellation" ? "Cancelled." : "Change recorded." };
}
