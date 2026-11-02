# New kinds and pricing (milestone 13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package, Visa, Insurance and Extra Items entered by hand, the Trip checklist in place of the visa/health/insurance text, the Card surcharge on any Item, and Online saving on Flight options.

**Architecture:** One migration (0030) adds four Item tables and puts them into every loop and view that lists the six existing ones. It also adds flat-rate fee rows, `trip_checks`, the card columns, and relaxes `item_bookings` for Extras with no Supplier. The edit screen, booking, invoicing and PDF already run off `TABLE_KIND` / `ITEM_FIELDS` / `TABS`, so each new kind is mostly config plus a few kind-specific rules. The money rules (fee units, Card surcharge, flat fees) live in `lib/` with node tests.

**Tech Stack:** Next.js (app router, server actions), Supabase Postgres + RLS, `node --test`, Tailwind.

**Spec:** `GLOSSARY.md` (Package, Visa, Insurance, Extra, Trip checklist, Card surcharge, Online saving; committed f7d0bea) and the grilling session of 2026-11-02 (summarised in Global Constraints).

## Global Constraints

- Branch `feat/new-kinds-pricing` (from `staging`). Migration `supabase/migrations/0030_new_kinds_pricing.sql`, run by the user in the Supabase SQL editor; header comment in the style of 0029.
- New tables → kinds → labels: `packages` → `package` "Package"; `visas` → `visa` "Visa"; `insurance_policies` → `insurance` "Insurance"; `extras` → `extra` "Extra". All hand-entered (no extraction); `image_id` stays null.
- Extra types (DB value → label → standard Transaction fee, Rand incl. VAT): `preseat` Pre-seating 287.50 · `baggage` Additional baggage 287.50 · `after_hours` After hours emergency service 948.75 · `meet_greet` Airport meet and greet 189.75 · `conference` Conference (per person) 230.00 · `report_mis` MIS report 747.50 · `report_adhoc` Ad hoc report 569.25 (a minimum: the fee may be raised, never set lower).
- Visa 529.00 per Visa (one Traveller each). Insurance 161.00 per policy. Package: no rate; the Consultant types the fee (a missing fee already blocks Generate version). Change, Refund and Pre-payment fees for the new kinds are 0.
- New kinds' fees are flat: the same in every Fee region. They have no Fee region (the region and fare-type pickers are hidden for them).
- Card surcharge: `card_paid` switch on every Item. Surcharge = round(Item total before surcharge × rate, 2). The rate is on the Fee schedule (`card_surcharge_rate`, default 0.0275), so a Client's own schedule can differ. It prints as its own line under the Item's price on the PDF.
- Online saving: `online_price` (Rand) on Flight options. Saving = online_price − price (the supplier's fare, taxes included, before fees). Staff only, never in the quote JSON. No flag (no threshold yet).
- Trip checklist checks, in order (DB value → label): `visa` Visa and entry requirements · `health` Health advice · `insurance` Insurance decision · `details` Traveller details checked with the supplier · `seats_meals` Seats and meals requested · `documents` Documents sent. Each has done (who, when) and a note. The PDF prints the notes of `visa`, `health` and `insurance` where `visa_info` / `health_info` / `insurance_info` printed.
- An Extra with no supplier price is booked with one click: no Supplier, no reference, no expected supplier-invoice date, `no_supplier_invoice` true, amount 0. (Agreed as "booked once added". A booked Item is locked, so booking straight away on add would lock it before its type and fee were filled in.)
- Follow existing patterns: server actions return `{ error?, notice? }` and `revalidatePath("/", "layout")`; the database decides permissions; `lib/` files import with `.ts` extensions so plain `node --test` runs them; no fee admin screen (fees are set by SQL, as today).

## Review Focus

1. A Conference Extra for 12 people: the Transaction fee counts per person, so R230 × 12 = R2 760, both on the PDF and in "to invoice". Test: `itemTotal(row, feeUnits("extra", row))` in Task 2.
2. Card surcharge on an Accommodation option with 3 rooms: the base includes the fee × 3. Turning prepaid or the price off and on recomputes it on every save. Test: `cardSurcharge` in Task 2. Manual check in Task 7.
3. Changing an Extra's type from Pre-seating to MIS report: the fee follows the new type (it's a key change like the Fee region). Test: `applyFees` in Task 2.
4. An Ad hoc report with its fee typed below R569.25 is refused, with a message naming the minimum. Manual check in Task 7.
5. Old Versions keep printing their frozen visa/health/insurance text after the three Trip columns are dropped. Expected: unchanged, because the PDF re-renders from frozen JSON (ADR 0006). Manual check in Task 7: retry an old Version's PDF.

---

### Task 1: Migration 0030

**Files:**
- Create: `supabase/migrations/0030_new_kinds_pricing.sql`

**Interfaces:**
- Produces:
  - Tables `packages (operator text, name text, destination text, start_date text, end_date text, deposit numeric(12,2) check (>= 0), balance_due_on date)`, `visas (country text, visa_type text, traveller_id uuid references travellers(id))`, `insurance_policies (insurer text, policy_type text, start_date text, end_date text, traveller_ids uuid[] not null default '{}')`, `extras (extra_type text check in the seven types, description text, flight_entity_id text, seats text, bags text, airport text, date text, time text, people integer check (> 0), period text)`. Dates are `text` like the other Item tables.
  - Each gets the 0009 common columns (minus `currency`/`price_text`, dropped in 0011), `fee_region_auto` (0019), and the new `card_paid boolean not null default false`, `card_surcharge numeric(12,2)`. `extras.price` defaults to 0.
  - `card_paid`, `card_surcharge` added to the six existing Item tables. `flight_options.online_price numeric(12,2) check (>= 0)`.
  - `fee_schedules.card_surcharge_rate numeric(6,4) not null default 0.0275 check (>= 0 and < 1)`.
  - `fee_rates`: kind check adds `package, visa, insurance, extra`. Variant check adds the seven Extra types. For every schedule, rows `('visa','domestic','',529,0,0,0)`, `('insurance','domestic','',161,0,0,0)`, and `('extra','domestic',<type>,<fee>,0,0,0)` for each type. The `'domestic'` there is a placeholder (comment: flat kinds have one row and `rateFor` ignores the region).
  - `trip_checks (trip_id uuid references trips on delete cascade, check_key text check in the six keys, done_at timestamptz, done_by uuid references profiles(id) default auth.uid(), note text, updated_at, primary key (trip_id, check_key))`, with RLS like `trips` and a history trigger.
  - `item_bookings`: `supplier_id`, `booking_reference`, `expected_invoice_on` become nullable, with check `kind = 'extra' and supplier_id is null and booking_reference is null and expected_invoice_on is null and amount = 0 and no_supplier_invoice or supplier_id is not null and booking_reference is not null and expected_invoice_on is not null`.

- [ ] **Step 1: The four tables, then the common columns** with one `do $$ foreach` over the four, copying the 0009 column list as altered by 0011 and 0019. Copy the 0009 RLS-policy loop (line 226) and the `_updated_at` trigger for them.

- [ ] **Step 2: Add the four tables to every list of Item tables:** the `_booked` trigger loop (0023), the `_history` trigger loop (0021), and the `quote_items` view (`create or replace`, four more `union all` lines with kinds `package`, `visa`, `insurance`, `extra`). Leave `store_extraction` alone, since it never sees these tables.

- [ ] **Step 3: A Visa's Traveller and an Insurance policy's Travellers must be on the Item's Trip.** Trigger `guard_item_travellers()` before insert or update on `visas` and `insurance_policies`. Message: "That Traveller is not on this Trip."

- [ ] **Step 4: Card, Online saving, Fee schedule and fee-rate columns, checks and seed rows** as above. Insert the seed rows with `insert ... select from fee_schedules`, so client schedules get them too.

- [ ] **Step 5: `trip_checks`.** Copy the existing `visa_info`, `health_info`, `insurance_info` into the notes of `visa`, `health`, `insurance` (only where non-blank; `done_at` stays null). Then `alter table trips drop column visa_info, drop column health_info, drop column insurance_info`.

- [ ] **Step 6: The `item_bookings` change** and its check. Read every function in 0023–0029 that reads `item_bookings.supplier_id` (`guard_payment_link`, the Refund and Commission setters, the views). Each must treat null as "matches no Supplier", never as an error. Note any that don't in the commit message and fix them in this file.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0030_new_kinds_pricing.sql
git commit -m "Migration 0030: Package, Visa, Insurance and Extra Items, Trip checklist, Card surcharge, Online saving"
```

### Task 2: `lib/` rules and tests

**Files:**
- Modify: `lib/extraction/tables.ts`, `lib/extraction/rows.ts:28`, `lib/fees.ts`, `lib/pdf/money.ts`, `lib/pdf/types.ts` (`Priced`), `app/trips/[id]/invoicing-data.ts:115`
- Test: `lib/fees.test.mjs`, `lib/pdf/money.test.ts`

**Interfaces:**
- Produces:
  - `tables.ts`: `EXTRACTED_KIND` (the current six), `TABLE_KIND = { ...EXTRACTED_KIND, packages: "package", visas: "visa", insurance_policies: "insurance", extras: "extra" }`, `ItemTable = keyof typeof TABLE_KIND`, `EXTRA_TYPES: [value, label][]` (Global Constraints order).
  - `fees.ts`: `FLAT_KINDS = new Set(["package", "visa", "insurance", "extra"])`. `rateFor(rates, kind, region, variant)`: for a flat kind, it ignores region and matches `variant` (pass `extra_type` for Extras, `""` otherwise). `applyFees`: for a flat kind, region null, variant `""`, `fee_region_auto` false; for `extra`, a changed `extra_type` counts as a key change.
  - `money.ts`: `feeUnits(kind: string, row: Record<string, unknown>): number` = `rooms` for `hotel`, `people` for an `extra` of type `conference`, else 1 (never below 1). `itemTotal(item, units)` adds `item.card_surcharge` when `card_paid`. `cardSurcharge(item: Priced, units: number, rate: number): number | null` = null unless `card_paid` and a price; otherwise round((itemTotal without the surcharge) × rate, 2).
  - `Priced` gains `card_paid?: boolean | null; card_surcharge?: Amount`.

- [ ] **Step 1: Write the failing tests.** In `fees.test.mjs`: `rateFor` finds the visa row for region `null` and for `"international"`; `rateFor(rates, "extra", null, "report_mis").transaction_fee === 747.5`; `applyFees("extra", {extra_type: "report_mis", transaction_fee: 287.5}, {extra_type: "preseat", ...}, ...)` sets 747.5; `applyFees("visa", ...)` leaves `fee_region` null. In `money.test.ts`: `feeUnits("extra", {extra_type: "conference", people: 12}) === 12`; `itemTotal({price: 0, transaction_fee: 230, markup: 0}, 12) === 2760`; `cardSurcharge({price: 1000, transaction_fee: 300, markup: 100, card_paid: true}, 3, 0.0275) === 52.25` (base 2 000); `cardSurcharge` with `card_paid: false` is null; `itemTotal({price: 1000, transaction_fee: 0, markup: 0, card_paid: true, card_surcharge: 27.5}) === 1027.5`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the Interfaces above. `rows.ts` iterates `EXTRACTED_KIND` (extraction rows carry only those six tables). `invoicing-data.ts` passes `feeUnits(TABLE_KIND-kind of the row, row)`. Its items map has no kind today, so add `kind` to the map value at its three callers (`edit-section.tsx:90`, `accounts/page.tsx:85`, `trips/[id]/accounts/page.tsx:40`).
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `"Fees for flat kinds and Extra types, fee units, Card surcharge"`.

### Task 3: Editing the new kinds

**Files:**
- Modify: `app/quotes/[id]/item-fields.ts`, `item-actions.ts`, `item-form.tsx`, `edit-section.tsx` (`TABS`), `app/accounts/page.tsx:49` (select list), `lib/fee-context.ts`

**Interfaces:**
- Consumes: Task 2's `TABLE_KIND`, `EXTRA_TYPES`, `FLAT_KINDS`, `cardSurcharge`, `feeUnits`.
- Produces: `FieldType` gains `"traveller"` (one, select), `"travellers"` (several, checkboxes) and `"flight"` (select of the Quote's Flight options by `entity_id`). `EXTRA_FIELDS: Record<extra type, string[]>` lists the field names each type shows. `FeeContext` gains `cardRate: number`.

- [ ] **Step 1: `ITEM_LABEL` / `ITEM_FIELDS`** for the four tables. `packages`: operator, name, destination, start/end date, deposit (money), balance due (date). `visas`: traveller, country, visa type. `insurance_policies`: insurer, policy type, start/end date, travellers. `extras`: type (select from `EXTRA_TYPES`), description, flight, seats, bags, airport, date, time, people (number), period. `EXTRA_FIELDS`:
  - preseat: flight, seats
  - baggage: flight, bags
  - after_hours: date, time, description
  - meet_greet: airport, date, time, description (who is met)
  - conference: description, people
  - report_mis / report_adhoc: period, description

  `PRICE_FIELDS` gains `card_paid` "Paid by international card" (checkbox). Flight options gain `online_price` "Comparable online price (R)" (money).
- [ ] **Step 2: `TABS`** gains, after Car rentals: `["packages", "packages", "Packages"]`, `["visas", "visas", "Visas"]`, `["insurance_policies", "insurance", "Insurance"]`, `["extras", "extras", "Extras"]`. Add the four tables to the `/accounts` select string.
- [ ] **Step 3: `saveItem`** (`item-actions.ts`):
  - Parse `traveller_ids` as a uuid list.
  - For `extras`, an empty `price` saves as 0.
  - For an `extras` row of type `report_adhoc`, refuse a `transaction_fee` below the schedule's rate: "An Ad hoc report's fee is at least R 569.25." (use `money(rate)`).
  - After `applyFees`, set `merged.card_surcharge = cardSurcharge(merged, feeUnits(kind, merged), ctx.cardRate)`, add `card_surcharge` to `computed`, and return it in `values`.
  - `loadFeeContext` reads `card_surcharge_rate` from the chosen schedule (0.0275 when there is none).
- [ ] **Step 4: `item-form.tsx`:**
  - The new pickers get their options from props, like `stays`. `edit-section.tsx` loads the Trip's Travellers (`trip_travellers` → `travellers(first_name, last_name)`) and the Flight options' labels.
  - For an Extra, only the fields in `EXTRA_FIELDS[type]` show; the rest stay in the form hidden.
  - Hide Fee region and fare type for `FLAT_KINDS`.
  - Show the Card surcharge (read-only money) when set.
  - On Flight options, under the comparable price, show "Online saving: R x" (or "Online is cheaper by R x" when negative), staff only.
- [ ] **Step 5: Run** `npm run typecheck && npm test`. Expected: PASS. Then on staging with 0030 run: add one of each new kind, fill it in, and check that the fees fill themselves and the Conference total multiplies.
- [ ] **Step 6: Commit** `"Edit screen: Packages, Visas, Insurance and Extras; Card surcharge switch; Online saving"`.

### Task 4: Booking an Extra with no supplier price

**Files:**
- Modify: `app/quotes/[id]/booking-actions.ts`, `booking-panel.tsx`, `app/trips/[id]/invoicing-data.ts:113`

**Interfaces:**
- Produces: `bookOwnExtra(quoteId: string, entityId: string, _prev: BookingFormState, fd: FormData): Promise<BookingFormState>`. It inserts `item_bookings { quote_id, entity_id, kind: "extra", amount: 0, currency: "ZAR", no_supplier_invoice: true }` and refuses unless the row is an Extra with price 0 ("Give it a supplier price of 0, or book it with its Supplier.").

- [ ] **Step 1:** The booking panel shows a single "Book (no supplier)" button for an unbooked Extra whose price is 0. Any other Item keeps the full booking form. A booked Extra with no Supplier shows "Booked, no supplier" and offers Unbook (while it has no Changes or invoices, as today), Changes and Cancellation.
- [ ] **Step 2:** `invoicing-data.ts` builds the label without a null Supplier or reference (`[label, supplier name, reference].filter(Boolean).join(" · ")`).
- [ ] **Step 3: Run** `npm run typecheck`. Then on staging: book an After hours Extra with one click, check it appears under "to invoice" and not under awaiting, link a Client invoice to it, and unbook a second one.
- [ ] **Step 4: Commit** `"Extras with no supplier price book with one click"`.

### Task 5: Trip checklist

**Files:**
- Create: `app/trips/[id]/checklist.tsx`, `app/trips/[id]/checklist-actions.ts`
- Modify: `app/trips/[id]/trip-view.tsx:31`, `trip-form.tsx:16-18,95-104`, `app/trips/actions.ts:35`

**Interfaces:**
- Produces: `CHECKS: [key, label][]` (Global Constraints order) in `checklist.tsx`. `saveCheck(tripId: string, key: string, fd: FormData): Promise<SaveResult>` upserts `{ trip_id, check_key, note, done_at: fd done ? (keep the stored one, or now()) : null, done_by }`.

- [ ] **Step 1:** Remove the three fields from `trip-form.tsx`, `TEXT_FIELDS` and the `trip-view.tsx` select.
- [ ] **Step 2:** `checklist.tsx` on the Trip page, under the Trip details: one row per check with a tick, a note (autosaved, `useAutosave` as on the Item form) and "Ticked by <name>, <date>" when done. Read-only for Accountants (ADR 0010).
- [ ] **Step 3: Run** `npm run typecheck`. Then on staging: tick a check and see who and when; untick it and see that cleared; check that the notes migrated from the old fields are there.
- [ ] **Step 4: Commit** `"Trip checklist replaces visa, health and insurance info"`.

### Task 6: The new kinds and the Card surcharge on the quote PDF

**Files:**
- Modify: `lib/pdf/assemble.ts`, `lib/pdf/types.ts`, `lib/pdf/quote-template.tsx`, `app/quotes/[id]/pdf-actions.ts:14,88`
- Test: `lib/pdf/assemble.test.ts`

**Interfaces:**
- Consumes: `trip_checks` notes; Task 2's `feeUnits`, `itemTotal`.
- Produces:
  - `AssembleInput.items` gains `packages, visas, insurance_policies, extras`.
  - `AssembleInput` gains `checks: Record<string, string | null>` (key → note), which replaces the trip's three fields.
  - `QuoteJson` gains `packages`, `visas`, `insurance`, `extras` (each `Priced` plus display fields). `QuoteJson.visa_info`, `health_info` and `insurance_info` keep their names and now come from `checks`.

- [ ] **Step 1: Write the failing tests** in `assemble.test.ts`:
  - A Package with deposit 5000 and balance due `2027-03-12` assembles `deposit_line: "Deposit R 5 000.00 now, balance by 12 Mar 2027"`.
  - Two Visas give two `visas` entries, each with its Traveller's name.
  - A Conference Extra for 12 assembles `units: 12`, and `totalText` of it gives "R 2 760.00".
  - `checks.visa = "Schengen needed"` lands in `quote.visa_info`.
  - `problems()` reports "A Package has a price but no Transaction fee." for a Package with a price and no fee.
  - Fixtures for the existing tests gain empty arrays for the four new tables and `checks: {}`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `assemble.ts`: build the four lists (Visa's Traveller name and Insurance's Travellers' names come from a `travellers` map added to `AssembleInput`), `number()` each kind, and add the four to `problems()`' `named` list (`name`, `country`, `insurer`, `description`; fallbacks "A Package", "A Visa", "An Insurance policy", "An Extra"). `priced()` copies `card_paid` and `card_surcharge`.
  - `pdf-actions.ts`: `ITEM_TABLES` gains the four tables, and it loads `trip_checks` and the Trip's Travellers.
  - `quote-template.tsx`:
    - **Packages:** a section after Car rentals, with the deposit line under the price.
    - **Visas and Insurance:** a table each.
    - **Extras:** a table showing the type label and description.
    - **Card surcharge:** wherever a price prints, a line "Card surcharge (international card) R x" under any Item that has one.
    - `totalText(x, x.units)` for the new kinds.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS. On staging: generate a Version with one of each new kind and a card-paid Item, then open the PDF.
- [ ] **Step 5: Commit** `"Quote PDF: Packages, Visas, Insurance, Extras and the Card surcharge line"`.

### Task 7: README and the whole-branch check

**Files:**
- Modify: `README.md` (milestone 13 moves to Done: "13. Packages, Visas, Insurance and Extras, the Trip checklist, Card surcharge and Online saving (migration 0030)"; the What works now list)

- [ ] **Step 1:** Update the README.
- [ ] **Step 2: Manual checks on staging**, with 0030 run:
  - Each Review Focus item.
  - Book, invoice and cancel a Visa with its Supplier.
  - An Accountant sees the new tabs and the checklist read-only.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build`. Expected: PASS.
- [ ] **Step 4: Commit** `"README: milestone 13 done"`.
