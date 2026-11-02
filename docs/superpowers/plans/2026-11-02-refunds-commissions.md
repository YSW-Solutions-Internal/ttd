# Refunds and Commissions (milestone 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track Refunds (on Cancellations) and Commissions (on booked Items), with the Payments that settle them, two Accounts queues with CSV exports, and an open-Refund badge on Trips.

**Architecture:** One migration (0029) adds a `kind` to Payments, Refund columns to `item_changes`, Commission columns to `item_bookings`, two `security definer` setters (Accountants edit no booking, like `set_no_supplier_invoice`), new link rules per kind, and two `security_invoker` views with the summed amounts. The arithmetic (open, out of pocket, owed) lives in small `lib/` functions with node tests; pages read the views and call them.

**Tech Stack:** Next.js (app router, server actions), Supabase Postgres + RLS, `node --test`, Tailwind.

**Spec:** `GLOSSARY.md` (Payment, Refund, Commission, Cancellation, Accounts queues; committed 70b39c9) and the grilling session of 2026-11-02 (decisions Q1–Q13, summarised in Global Constraints).

## Global Constraints

- Branch `feat/refunds-commissions` (from `staging`). Migration file `supabase/migrations/0029_refunds_commissions.sql`, run by the user in the Supabase SQL editor; header comment in the style of 0027.
- Payment kinds, DB values → labels: `paid` "Paid to Supplier", `received` "Received from Client", `refund_in` "Refund from Supplier", `refund_out` "Refund to Client", `commission_in` "Commission from Supplier". Supplier side: `paid`, `refund_in`, `commission_in`; Client side: `received`, `refund_out`. Amounts stay positive; reversals copy the kind.
- Money in (positive on a statement): `received`, `refund_in`, `commission_in`. Money out: `paid`, `refund_out`.
- A Refund exists for each Cancellation with `expected_refund > 0`. Status `requested` (null means Requested), `approved`, `declined`. Fields: requested date, Supplier reference, approved amount (Rand; defaults to `expected_refund`). Any User, Accountants included, sets them.
- Refund received (Rand) = Σ refund-in links × their Payment's rate. Paid back (Rand) = refund-out money on credit notes linked to the Cancellation, in proportion to the Cancellation's share of each credit note. Due back = approved − the Cancellation's `agency_fee`. Open unless Declined, or received ≥ approved and paid back ≥ due back. Out of pocket when paid back > received.
- A Declined Refund makes the Cancellation's charge invoiceable (`changeCharge` returns `changeTotal`).
- Commission: only on booked Items, never on Changes. Amount in the Item's booked currency, typed (> 0); optional note; `deducted` or claimed. Claimed ones also have claimed date, claim reference and due date. Any User, Accountants included, sets it.
- Link caps (money beyond them stays unlinked): `paid` to an Item ≤ booked − deducted Commission; `paid` to a Change as today; `refund_in` only to a Cancellation with an open, not Declined Refund of that Supplier, Σ Rand ≤ approved; `refund_out` only to a Client credit note on the Trip, Σ ≤ −credit note amount; `commission_in` only to an Item with a claimed Commission, same currency, Σ ≤ Commission. Supplier-side sums count only links of the same kind.
- Accounts queues: **Refunds**: open Refunds, out of pocket first, then oldest requested. **Commissions owed**: claimed Commissions with something owed, overdue first, then by due date. Each has a CSV export (Accountants and Administrators only, like the statement CSV).
- The open-Refund badge shows next to the Trip status on the Trips list (`app/page.tsx`), the Trip page (`trip-view.tsx`) and the Trip's accounts page. Never a Trip status.
- Follow existing patterns: server actions return `{ error?, notice? }` and `revalidatePath("/", "layout")`; the database decides permissions and caps; client forms use `useKeptForm`; `lib/` files import with `.ts` extensions so plain `node --test` runs them.

## Review Focus

1. A Refund approved in Rand but received in USD at a different rate: received Rand can land just under or over approved. Expected: staff edit the approved amount to what actually came in, while the Refund is open; the cap error message says what's approved and what the link would make it. Test: `refundState` treats received within R0.005 of approved as complete (rounding), in Task 2.
2. A reversal of a refund-in or commission-in Payment: its negative links must pass the caps and take the Refund/Commission back to open. Expected: open again. Covered by the sums being plain Σ (negatives reduce); test in Task 2: `refundState` with received back to 0 is open.
3. A Cancellation whose `expected_refund` is later corrected to 0: the Refund disappears; existing refund-in links would then exceed the cap. Expected: the correction is refused while refund-in links exist. Test: SQL in Task 1 (`guard_refund_correction`), manual check in Task 7.
4. Deducted Commission larger than what's booked, or switched from claimed to deducted after commission-in Payments were linked. Expected: both refused by `set_commission`. Manual check in Task 7.
5. A Payment entered as the wrong kind: Payments are never edited. Expected: delete and enter again while Unreconciled, as today; nothing new needed. Manual check in Task 7.

---

### Task 1: Migration 0029

**Files:**
- Create: `supabase/migrations/0029_refunds_commissions.sql`

**Interfaces:**
- Produces:
  - `payments.kind text not null` (values above), backfilled `supplier → paid`, `client → received`; check `side = 'supplier' and kind in ('paid','refund_in','commission_in') or side = 'client' and kind in ('received','refund_out')`.
  - `item_changes`: `refund_status text check in ('requested','approved','declined')`, `refund_requested_on date`, `refund_reference text`, `refund_approved numeric(12,2) check (>= 0)`; check that all four are null unless `kind = 'cancellation' and expected_refund > 0`.
  - `item_bookings`: `commission numeric(12,2) check (> 0)`, `commission_note text`, `commission_deducted boolean not null default false`, `commission_claimed_on date`, `commission_claim_reference text`, `commission_due_on date`; check that the claim fields are null when `commission_deducted`, and every commission field is null/false when `commission` is null.
  - `public.set_refund(p_change_id uuid, p_status text, p_requested_on date, p_reference text, p_approved numeric) returns void`, `security definer`, allowed when `can_edit() or is_accounts()`.
  - `public.set_commission(p_quote_id uuid, p_entity_id text, p_amount numeric, p_note text, p_deducted boolean, p_claimed_on date, p_reference text, p_due_on date) returns void`, same permission; `p_amount` null clears all commission fields.
  - View `public.refund_totals` (`with (security_invoker = true)`): one row per Cancellation with `expected_refund > 0`: `trip_id, quote_id, entity_id, change_id, supplier_id, happened_on, refund_status, refund_requested_on, refund_reference, expected_refund, approved` (= `coalesce(refund_approved, expected_refund)`), `agency_fee, received` (Rand), `paid_back` (Rand).
  - View `public.commission_totals` (`security_invoker`): one row per `item_bookings` with `commission is not null`: `trip_id, quote_id, entity_id, supplier_id, currency, commission, commission_note, commission_deducted, commission_claimed_on, commission_claim_reference, commission_due_on, received` (booked currency).

- [ ] **Step 1: Payment kind.** `add column kind`, backfill in the same statement (`default` via `update` before `set not null`), the side/kind check. Replace `guard_new_payment()` with the 0027 body plus `new.kind := o.kind;` in the reversal branch.

- [ ] **Step 2: Refund and Commission columns** with the checks above.

- [ ] **Step 3: `guard_verified_booking()`**: replace with the 0024 body, adding the four refund columns and six commission columns to both exempt arrays, so a verified Supplier invoice doesn't lock them to Administrators.

- [ ] **Step 4: Setters.** `set_refund` refuses a change that isn't a Cancellation with `expected_refund > 0`, and an approved amount below what's already received (message names both). `set_commission` refuses a non-booked Item, `p_amount <= 0`, a deducted Commission above `item_bookings.amount`, switching to deducted while commission-in links exist, an amount below what's already received, and paid links exceeding booked − deducted. Both `revoke ... from public, anon; grant ... to authenticated`.

- [ ] **Step 5: `guard_refund_correction()`** before update on `item_changes`: refuse lowering `expected_refund` to 0 or null while refund-in links point at the change ("This Refund has money received against it.").

- [ ] **Step 6: Replace `guard_payment_link()`.** Keep the 0027 prelude (trip, reversed, sign, total ≤ Payment). Then by `p.kind`:
  - `paid`: the 0027 Supplier branch; for an Item, `booked := b.amount - case when b.commission_deducted then coalesce(b.commission, 0) else 0 end`; the `paid` sum joins `payments` and counts `kind = 'paid'` only.
  - `refund_in`: `change_id` required, that Change a Cancellation of this Supplier's booking on this Trip with `expected_refund > 0` and `refund_status is distinct from 'declined'`; Σ(`link.amount * payment.rate`) over refund-in links incl. this one ≤ `coalesce(refund_approved, expected_refund)`.
  - `commission_in`: `change_id` null, the booking this Supplier's on this Trip, `commission is not null and not commission_deducted`, `b.currency = p.currency`; Σ commission-in links ≤ `commission`.
  - `received`: the 0027 Client branch.
  - `refund_out`: the invoice is the Trip's Client credit note (`side = 'client' and amount < 0`); Σ refund-out links on it ≤ `-inv.amount`.

- [ ] **Step 7: The two views** with the columns above. `paid_back`: for each credit note `n` with a Client `invoice_links` row `cl` to this Cancellation, `sum(cl.amount / n.amount * (Σ refund-out links on n))`. Add `grant select ... to authenticated`.

- [ ] **Step 8: Check every replaced function** (`guard_new_payment`, `guard_verified_booking`, `guard_payment_link`) still carries each check of its 0027/0024 original; there is no local database, so the user runs the file on staging before Task 7.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0029_refunds_commissions.sql
git commit -m "Migration 0029: Payment kinds, Refunds on Cancellations, Commissions on bookings"
```

### Task 2: `lib/` rules and tests

**Files:**
- Modify: `lib/payments.ts`, `lib/payments.test.ts`, `lib/invoicing.ts:56-65`, `lib/invoicing.test.ts`, `package.json` (test list)
- Create: `lib/refunds.ts`, `lib/refunds.test.ts`

**Interfaces:**
- Produces (in `lib/payments.ts`):
  - `type PaymentKind = "paid" | "received" | "refund_in" | "refund_out" | "commission_in"`
  - `PAYMENT_KIND_LABEL: Record<PaymentKind, string>`; `KINDS: Record<Side, PaymentKind[]>` (first is the default)
  - `moneyIn(kind: PaymentKind): boolean`
  - `PaymentValues` gains `kind: PaymentKind`; `parsePayment` reads `kind` (missing → `KINDS[side][0]`; one not of that side → `FieldParseError(…, "kind")`)
- Produces (in `lib/refunds.ts`):
  - `type RefundStatus = "requested" | "approved" | "declined"`; `REFUND_STATUS_LABEL`
  - `refundState(r: { refund_status: RefundStatus | null; approved: number; agency_fee: number; received: number; paid_back: number }): { open: boolean; outOfPocket: boolean; dueBack: number }`
  - `commissionOwed(c: { commission: number; commission_deducted: boolean; received: number }): number` (0 when deducted)
  - `parseRefund(fd: FormData): { status: RefundStatus; requested_on: string | null; reference: string | null; approved: number | null }`
  - `parseCommission(fd: FormData): { amount: number | null; note: string | null; deducted: boolean; claimed_on: string | null; reference: string | null; due_on: string | null }` (blank amount = clear; claim fields dropped when deducted)
- `changeCharge(c)` accepts `refund_status?: string | null` on its row type.

- [ ] **Step 1: Write the failing tests** in `lib/refunds.test.ts`:

```ts
test("a Refund closes once received and paid back are complete, or once Declined", () => {
  const r = { refund_status: "approved" as const, approved: 5000, agency_fee: 350, received: 5000, paid_back: 4650 };
  assert.deepEqual(refundState(r), { open: false, outOfPocket: false, dueBack: 4650 });
  assert.equal(refundState({ ...r, paid_back: 4000 }).open, true);
  assert.equal(refundState({ ...r, received: 4999.996 }).open, false); // rounding
  assert.equal(refundState({ ...r, received: 0 }).open, true); // a reversed refund-in
  assert.equal(refundState({ ...r, refund_status: "declined", received: 0, paid_back: 0 }).open, false);
});
test("paying the Client back before the Supplier refunds is out of pocket", () => {
  assert.equal(refundState({ refund_status: null, approved: 5000, agency_fee: 350, received: 0, paid_back: 4650 }).outOfPocket, true);
});
test("a deducted Commission is never owed; a claimed one is owed until received", () => {
  assert.equal(commissionOwed({ commission: 120, commission_deducted: true, received: 0 }), 0);
  assert.equal(commissionOwed({ commission: 120, commission_deducted: false, received: 50 }), 70);
});
test("parseCommission drops claim fields when deducted; a blank amount clears it", () => { /* deducted → claimed_on null; amount "" → null; "0" throws */ });
test("parseRefund needs a known status and a non-negative approved amount", () => { /* "approved" + "4200,00" → 4200; "lost" throws; "-1" throws */ });
```

In `lib/invoicing.test.ts`: `changeCharge({ ...c, refund_status: "declined" })` equals `changeTotal(c)` (480 for the existing fixture `c`). In `lib/payments.test.ts`: kind defaults to `paid`/`received`; `refund_out` on the supplier side throws `/kind/i`; `moneyIn("refund_in") === true`, `moneyIn("refund_out") === false`.

- [ ] **Step 2: Add `lib/refunds.test.ts` to the `test` script; run `npm test`.** Expected: FAIL (module not found / assertions).

- [ ] **Step 3: Implement** the interfaces above. Round with the file-local `round` pattern; compare with `>= x - 0.005`.

- [ ] **Step 4: Run `npm test`.** Expected: all pass.

- [ ] **Step 5: Commit** `lib/` and `package.json`: "Payment kinds, Refund and Commission rules".

### Task 3: Payments by kind

**Files:**
- Modify: `app/trips/[id]/payment-forms.tsx` (AddPaymentForm: "What" select from `KINDS[side]`, `name="kind"`), `app/trips/[id]/payment-actions.ts` (insert includes `kind`), `app/trips/[id]/payments.tsx`, `app/trips/[id]/accounts/page.tsx`, `app/trips/[id]/invoicing-data.ts`, `app/accounts/statements/[account]/data.ts`, `app/accounts/page.tsx` (payments select adds `kind`, "What" column shows the label)

**Interfaces:**
- Consumes: `PaymentKind`, `PAYMENT_KIND_LABEL`, `KINDS`, `moneyIn` (Task 2); `refund_totals`, `commission_totals` (Task 1).
- `Payments` props gain `creditNotes: { id: string; number: string; outstanding: number }[]` (outstanding = −amount − refund-out settled) and `refunds: { changeId: string; entityId: string; supplierId: string; label: string; left: number }[]`, `commissions: { entityId: string; supplierId: string; label: string; left: number; currency: string }[]`.

- [ ] **Step 1:** `payments.tsx`: select `kind`; heading uses `PAYMENT_KIND_LABEL` (keep "Reversal"); link targets by kind: `paid` → billables as today; `refund_in` → `refunds` of the Payment's Supplier with `left > 0` (target value `entityId|changeId`); `commission_in` → `commissions` of that Supplier (value `entityId`); `received` → invoices; `refund_out` → `creditNotes` (value invoice id). Unlinked message for `refund_out`: "not yet linked to a credit note."
- [ ] **Step 2:** `accounts/page.tsx`: fetch credit notes (`lt("amount", 0)`), `refund_totals` and `commission_totals` for the Trip; `payment_links` select adds `payments(kind)`; `paid` counts only `kind === "paid"`; `settled` counts `received` only; credit-note settled counts `refund_out`.
- [ ] **Step 3:** `invoicing-data.ts`: the Item's `supplierDue` = `amount − (commission_deducted ? commission : 0)`; add the two columns to the `item_bookings` select.
- [ ] **Step 4:** Statements: `kind` label from `PAYMENT_KIND_LABEL`, `signed = (moneyIn(kind) ? 1 : -1) * rand_amount`. The CSV route needs no change.
- [ ] **Step 5:** `npx tsc --noEmit && npm test`. Expected: clean. Commit "Payments by kind: refunds, commissions, statements signed by kind".

### Task 4: Refunds and Commissions on the Trip's accounts page

**Files:**
- Create: `app/trips/[id]/refunds.tsx` (server: list + forms), `app/trips/[id]/refund-forms.tsx` (client forms), `app/trips/[id]/refund-actions.ts`
- Modify: `app/trips/[id]/accounts/page.tsx` (render both sections between Invoices and Payments)

**Interfaces:**
- Consumes: `refundState`, `commissionOwed`, `parseRefund`, `parseCommission`, `REFUND_STATUS_LABEL` (Task 2); `set_refund`, `set_commission`, both views (Task 1).
- Produces: `setRefund(changeId: string, _prev, fd): Promise<PaymentFormState>` and `setCommission(quoteId: string, entityId: string, _prev, fd): Promise<PaymentFormState>` calling `supabase.rpc(...)`.

- [ ] **Step 1:** `refund-actions.ts`: the two actions (parse, rpc, `revalidatePath("/", "layout")`, `{ notice: "Saved." }`).
- [ ] **Step 2:** `refunds.tsx`: **Refunds**: per `refund_totals` row: Item label, Supplier, status badge, expected, approved, received, due back, paid back, "Out of pocket" danger badge, "Open"/"Closed"; form: status select, requested date, reference, approved (prefilled). **Commissions**: every booked Item (from `billables` where `changeId === null`): commission, note, deducted/claimed, claim fields, received and owed for claimed; form with a "Deducted from the Supplier payment" checkbox that hides the claim fields. Empty Commission = "None"; a booked Item with no commission shows only "Add commission".
- [ ] **Step 3:** `npx tsc --noEmit`. Commit "Refunds and Commissions on each Trip's accounts page".

### Task 5: Open-Refund badge

**Files:**
- Modify: `app/page.tsx` (Trips list), `app/trips/[id]/trip-view.tsx:111`, `app/trips/[id]/accounts/page.tsx:64`

- [ ] **Step 1:** Each page reads `refund_totals` (`.in("trip_id", ids)` on the list) and shows `<Badge tone="amber">Refund open</Badge>` after `TripStatusBadge` when any row's `refundState(...).open`.
- [ ] **Step 2:** `npx tsc --noEmit`. Commit "Trips show an open Refund beside their status".

### Task 6: Accounts queues and exports

**Files:**
- Modify: `app/accounts/page.tsx` (QUEUES gains `{ key: "refunds", label: "Refunds" }`, `{ key: "commissions", label: "Commissions owed" }`; counts; two tables; a "Download CSV" link on each)
- Create: `app/accounts/refunds/csv/route.ts`, `app/accounts/commissions/csv/route.ts`, `app/accounts/refunds-data.ts` (`loadRefundQueue()`, `loadCommissionQueue()` shared by page and CSV)

**Interfaces:**
- Produces: `loadRefundQueue(): Promise<RefundRow[]>` (open only, sorted out of pocket first, then `refund_requested_on ?? happened_on` ascending) and `loadCommissionQueue(): Promise<CommissionRow[]>` (claimed with owed > 0, sorted `commission_due_on` ascending, nulls last; overdue = due < today), each row with its Trip `{ id, reference, title }` and Supplier name.

- [ ] **Step 1:** The two loaders: `everyRow` over each view, then one `.in("id", …)` query each for `trips(id, reference, title)` and `suppliers(id, name)` (PostgREST can't embed through a view without declared keys). Item labels come from `loadBillables`' label pattern: `ITEM_LABEL` plus the Item row's `label ?? name`, fetched per Quote as `/accounts` already does.
- [ ] **Step 2:** The page tables (rows link to `/trips/[id]/accounts`), and the CSV routes copying `app/accounts/statements/[account]/csv/route.ts`'s guard and `csvLine`. Refund columns: Trip, Item, Supplier, Status, Requested, Reference, Approved, Received, Due back, Paid back, Out of pocket. Commission columns: Trip, Item, Supplier, Currency, Commission, Received, Owed, Claimed, Claim reference, Due.
- [ ] **Step 3:** `npx tsc --noEmit && npm test`. Commit "Accounts queues: Refunds and Commissions owed, with CSV exports".

### Task 7: README and click-test

**Files:**
- Modify: `README.md` (milestone 12 moves into "Done: … 12. Refunds and Commissions (migration 0029)")

- [ ] **Step 1:** README; commit.
- [ ] **Step 2:** User runs 0029 on staging. Then click-test on a test Trip: cancel an issued Item with a refund expected → Refund appears, Trip shows "Refund open"; record refund-out before refund-in → out of pocket; record refund-in in USD, link, approve; close; decline a second one → its fee appears in To invoice; add a claimed Commission, link a commission-in Payment partly → owed drops; deducted Commission → Supplier paid "of" shows booked less Commission; reverse a refund-in → Refund opens again; Review Focus items 3–5 refused with readable messages; both CSVs download.
- [ ] **Step 3:** `npx tsc --noEmit && npm test`; push the branch when the user asks.
