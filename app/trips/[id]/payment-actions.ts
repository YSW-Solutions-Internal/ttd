"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FieldParseError } from "@/lib/form-values";
import { parseLinkAmount, type Side } from "@/lib/invoicing";
import { parsePayment, type PaymentStatus } from "@/lib/payments";

// Who may do what, and whether accounts and links fit, is decided by the database (migration 0027).

export type PaymentFormState = { error?: string; notice?: string };

const failed = (e: unknown): PaymentFormState => ({
  error: e instanceof FieldParseError || e instanceof Error ? e.message : "Could not read the form.",
});

// The Trip's accounts page, the Accounts queues and statements all show Payments.
const done = () => revalidatePath("/", "layout");

export async function addPayment(tripId: string, side: Side, _prev: PaymentFormState, fd: FormData): Promise<PaymentFormState> {
  try {
    const v = parsePayment(fd, side);
    const supabase = await createClient();
    const { error } = await supabase.from("payments").insert({ ...v, trip_id: tripId, side });
    if (error) return { error: error.message };
  } catch (e) {
    return failed(e);
  }
  done();
  return { notice: "Payment recorded." };
}

/** Until it is Reconciled, a Payment entered wrong is deleted and entered again. */
export async function deletePayment(paymentId: string, _prev: PaymentFormState): Promise<PaymentFormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("payments").delete().eq("id", paymentId).select("id");
  if (error) return { error: error.code === "23503" ? "This Payment is reversed, so it stays." : error.message };
  if (!data?.length) return { error: "Only an Unreconciled Payment can be deleted. Reverse it instead." };
  done();
  return {};
}

/** The opposite of a Payment, on the day it was undone; the database copies the rest and its links. */
export async function reversePayment(paymentId: string, _prev: PaymentFormState, fd: FormData): Promise<PaymentFormState> {
  const paid_on = String(fd.get("paid_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) return { error: "Give the date of the reversal." };
  const supabase = await createClient();
  const { data: o } = await supabase.from("payments").select("trip_id, side, account_id, amount").eq("id", paymentId).maybeSingle();
  if (!o) return { error: "Payment not found." };
  // Placeholders for the not-null columns; guard_new_payment() overwrites them from the original.
  const { error } = await supabase.from("payments").insert({ reverses_id: paymentId, paid_on, trip_id: o.trip_id, side: o.side, account_id: o.account_id, amount: -o.amount, notes: String(fd.get("notes") ?? "").trim() || null });
  if (error) return { error: error.code === "23505" ? "This Payment is already reversed." : error.message };
  done();
  return { notice: "Reversed." };
}

/** Links part of a Payment: a booked Item or Change ("entityId" or "entityId|changeId") or a Client invoice (its id). */
export async function addPaymentLink(paymentId: string, quoteId: string, side: Side, _prev: PaymentFormState, fd: FormData): Promise<PaymentFormState> {
  try {
    const target = String(fd.get("target") ?? "");
    if (!target) return { error: "Choose what this Payment is for." };
    const amount = parseLinkAmount(String(fd.get("amount") ?? ""), false);
    const [entityId, changeId] = target.split("|");
    const row = side === "client" ? { invoice_id: target } : { quote_id: quoteId, entity_id: entityId, change_id: changeId || null };
    const supabase = await createClient();
    const { error } = await supabase.from("payment_links").insert({ payment_id: paymentId, amount, ...row });
    if (error) return { error: error.code === "23505" ? "This Payment is already linked to that; unlink it to change the amount." : error.message };
  } catch (e) {
    return failed(e);
  }
  done();
  return {};
}

export async function removePaymentLink(linkId: string, _prev: PaymentFormState): Promise<PaymentFormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("payment_links").delete().eq("id", linkId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "A reversed Payment keeps its links." };
  done();
  return {};
}

/** Reconciled, Query (with a reason) or back to Unreconciled: Accountants and Administrators only. */
export async function setPaymentStatus(paymentId: string, status: PaymentStatus, _prev: PaymentFormState, fd: FormData): Promise<PaymentFormState> {
  const reason = String(fd.get("query_reason") ?? "").trim();
  if (status === "query" && !reason) return { error: "Say what is wrong with it." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status, query_reason: status === "query" ? reason : null })
    .eq("id", paymentId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only an Accountant or Administrator can reconcile." };
  done();
  return {};
}
