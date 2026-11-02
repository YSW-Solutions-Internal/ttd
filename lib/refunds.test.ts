import { test } from "node:test";
import assert from "node:assert/strict";
import { commissionOwed, openRefundTrips, parseCommission, parseRefund, refundState } from "./refunds.ts";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

test("a Refund closes once received and paid back are complete, or once Declined", () => {
  const r = { refund_status: "approved" as const, issued: true, approved: 5000, agency_fee: 350, received: 5000, paid_back: 4650 };
  assert.deepEqual(refundState(r), { open: false, outOfPocket: false, dueBack: 4650 });
  assert.equal(refundState({ ...r, paid_back: 4000 }).open, true);
  assert.equal(refundState({ ...r, received: 4999.996 }).open, false); // rounding
  assert.equal(refundState({ ...r, received: 0 }).open, true); // a reversed refund-in
  assert.equal(refundState({ ...r, refund_status: "declined", received: 0, paid_back: 0 }).open, false);
});

test("paying the Client back before the Supplier refunds is out of pocket", () => {
  assert.equal(refundState({ refund_status: null, issued: true, approved: 5000, agency_fee: 350, received: 0, paid_back: 4650 }).outOfPocket, true);
});

test("before issue nothing is due back through the Refund; it closes once the Supplier has paid", () => {
  const r = { refund_status: "approved" as const, issued: false, approved: 5000, agency_fee: 350, received: 5000, paid_back: 0 };
  assert.deepEqual(refundState(r), { open: false, outOfPocket: false, dueBack: 0 });
  assert.equal(refundState({ ...r, received: 0 }).open, true);
});

test("an approved amount below the fee leaves nothing due back", () => {
  assert.equal(refundState({ refund_status: "approved", issued: true, approved: 200, agency_fee: 350, received: 0, paid_back: 0 }).dueBack, 0);
});

test("a deducted Commission is never owed; a claimed one is owed until received", () => {
  assert.equal(commissionOwed({ commission: 120, commission_deducted: true, received: 0 }), 0);
  assert.equal(commissionOwed({ commission: 120, commission_deducted: false, received: 50 }), 70);
});

test("parseCommission drops claim fields when deducted; a blank amount clears it", () => {
  const claim = { amount: "120,50", note: " 10% of net ", claimed_on: "2026-11-02", reference: "CL-1", due_on: "2026-12-01" };
  assert.deepEqual(parseCommission(form(claim)), { amount: 120.5, note: "10% of net", deducted: false, claimed_on: "2026-11-02", reference: "CL-1", due_on: "2026-12-01" });
  const deducted = parseCommission(form({ ...claim, deducted: "on" }));
  assert.deepEqual([deducted.deducted, deducted.claimed_on, deducted.reference, deducted.due_on], [true, null, null, null]);
  assert.equal(parseCommission(form({ ...claim, amount: "" })).amount, null);
  assert.throws(() => parseCommission(form({ ...claim, amount: "0" })), { field: "amount" });
});

test("parseRefund needs a known status and a non-negative approved amount", () => {
  const ok = parseRefund(form({ status: "approved", requested_on: "2026-11-01", reference: " R-9 ", approved: "4200,00" }));
  assert.deepEqual(ok, { status: "approved", requested_on: "2026-11-01", reference: "R-9", approved: 4200 });
  assert.equal(parseRefund(form({ status: "requested", requested_on: "", reference: "", approved: "" })).approved, null);
  assert.throws(() => parseRefund(form({ status: "lost" })), { field: "status" });
  assert.throws(() => parseRefund(form({ status: "approved", approved: "-1" })), { field: "approved" });
});

test("a Trip has an open Refund while any of its Refunds is open", () => {
  const row = { trip_id: "t1", refund_status: null, issued: true, approved: 100, agency_fee: 0, received: 0, paid_back: 0 };
  const closed = { ...row, trip_id: "t2", received: 100, paid_back: 100 };
  assert.deepEqual([...openRefundTrips([row, closed, { ...closed, trip_id: "t3", refund_status: "declined" }])], ["t1"]);
});
