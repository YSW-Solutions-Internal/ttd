"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failed } from "@/lib/form-values";
import { parseCommission, parseRefund } from "@/lib/refunds";
import type { PaymentFormState } from "./payment-actions";

// Any User, Accountants included; the rules are in the database (migration 0029).


export async function setRefund(changeId: string, _prev: PaymentFormState, fd: FormData): Promise<PaymentFormState> {
  try {
    const v = parseRefund(fd);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_refund", {
      p_change_id: changeId,
      p_status: v.status,
      p_requested_on: v.requested_on,
      p_reference: v.reference,
      p_approved: v.approved,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/", "layout");
  return { notice: "Saved." };
}

export async function setCommission(quoteId: string, entityId: string, _prev: PaymentFormState, fd: FormData): Promise<PaymentFormState> {
  try {
    const v = parseCommission(fd);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_commission", {
      p_quote_id: quoteId,
      p_entity_id: entityId,
      p_amount: v.amount,
      p_note: v.note,
      p_deducted: v.deducted,
      p_claimed_on: v.claimed_on,
      p_reference: v.reference,
      p_due_on: v.due_on,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/", "layout");
  return { notice: "Saved." };
}
