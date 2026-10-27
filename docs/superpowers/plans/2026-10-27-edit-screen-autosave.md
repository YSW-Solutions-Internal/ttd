# Edit Screen Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Item cards, the Trip form, Stay rows and the Client form save themselves field by field, with visible status, a leaving warning, and Generate version saving first.

**Architecture:** A pure `SaveQueue` (one per record) holds the record's unsaved fields, runs one save at a time and keeps the fields on failure. A client `AutosaveProvider` in the root layout tracks every queue on screen, guards leaving (beforeunload and in-app link clicks) and lets Generate version wait for all saves. A `useAutosave` hook wires a form's native `change` events to its queue and puts server-filled values back into the form. Server actions accept only the changed fields and return `SaveResult`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, TypeScript, `node --test` (type stripping, relative imports only in tested files).

**Spec:** `docs/superpowers/specs/2026-10-27-edit-screen-autosave-design.md`

## Global Constraints

- Autosave: Item cards (incl. flights table), Trip form, existing Stay rows, Client edit form, New Client, the empty "add Stay" row. Everything else keeps its button.
- Text/number/date/time/textarea save on the native `change` event (cursor leaves, value changed); selects and checkboxes on change.
- A save sends only changed fields; the server writes only those columns plus values it computes.
- One save in flight per record; a failed save keeps all its fields and every later save of that record carries them.
- Status per record: "Saving…", "Saved", "Couldn't save: <reason>" + **Retry** (manual only), and the "Not saved" badge while it has unsaved or failed changes.
- Price, Markup, Transaction fee, Change fee, Refund fee, Pre-payment fee: at most 2 decimals.
- Never overwrite the focused field with a server value; Item cards never re-mount after a save.
- Generate version waits for every save; if any record failed it names it and generates nothing.
- Branch `feat/edit-screen-autosave` (exists). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Typing in a Price box and clicking Generate version straight away: the new price is in the Version. (Task 5, manual check.)
2. Editing two fields on one card while the first save is still running: both end up saved, the later value wins. (Task 2, `SaveQueue` test "queues changes made during a save".)
3. A bad Price, then an edit to Notes on the same card: nothing saves until the price is fixed, then both save. (Task 2, test "keeps failed fields and sends them with the next change".)
4. A save returning new fees while the cursor sits in another fee box: that box keeps what is being typed. (Task 3, `applyValues` skips the focused element; Task 4 manual check.)
5. Amounts typed as "1e3", "1200.505", "1,5", "-50", "" : rejected, rejected, 1.5, -50, null. (Task 1, `parseAmount` test.)

---

### Task 1: Form value parsing and the 2-decimal rule

**Files:**
- Create: `lib/form-values.ts`, `lib/form-values.test.ts`
- Modify: `app/quotes/[id]/item-fields.ts` (add `"money"` to `FieldType`; `price` and `markup` become `"money"`)
- Modify: `package.json` (`test` script: add `lib/form-values.test.ts`)

**Interfaces:**
- Produces:
  - `type SaveResult = { error?: string; field?: string; values?: Record<string, string> }` (`field` = name of the field the error is about; `values` = server-filled fields, as form strings)
  - `type FormField = { name: string; label: string; type: string }` (structurally matches `Field` in `item-fields.ts`)
  - `parseAmount(raw: string, label: string): number | null` — trims, accepts one `,` as decimal point; `""` → `null`; must match `/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/` else throws `Error(\`${label} must be an amount in Rand with at most 2 decimals.\`)`
  - `parseField(field: FormField, raw: FormDataEntryValue | null): unknown` — today's `parse()` from `item-actions.ts` moved here, plus `"money"` → `parseAmount`, checkbox true only for `"on"`
  - `parseChanged(fields: FormField[], formData: FormData): Record<string, unknown>` — parses only names present in `formData` (`formData.has`); on a throw re-throws `FieldError`
  - `class FieldError extends Error { field: string }`

- [ ] **Step 1: Write the failing tests** in `lib/form-values.test.ts`:

```ts
test("parseAmount", () => {
  assert.equal(parseAmount("1200", "Price"), 1200);
  assert.equal(parseAmount("1200.50", "Price"), 1200.5);
  assert.equal(parseAmount("1,5", "Price"), 1.5);
  assert.equal(parseAmount("-50", "Markup"), -50);
  assert.equal(parseAmount("  ", "Price"), null);
  assert.throws(() => parseAmount("1200.505", "Price"), /Price must be an amount in Rand with at most 2 decimals/);
  assert.throws(() => parseAmount("1e3", "Price"));
  assert.throws(() => parseAmount("R1 200", "Price"));
});
test("parseChanged reads only fields that were sent", () => {
  const fd = new FormData(); fd.set("notes", " hi "); fd.set("prepaid", "off");
  assert.deepEqual(parseChanged(FIELDS, fd), { notes: "hi", prepaid: false });
});
test("parseChanged names the bad field", () => {
  const fd = new FormData(); fd.set("price", "1.234");
  assert.throws(() => parseChanged(FIELDS, fd), (e) => e instanceof FieldError && e.field === "price");
});
```
(`FIELDS` = price money, markup money, prepaid checkbox, notes textarea.)

- [ ] **Step 2: Run** `node --test lib/form-values.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/form-values.ts`**; in `item-fields.ts` add `"money"` and switch `price`, `markup`.
- [ ] **Step 4: Run** `npm test` — Expected: all pass. `npm run typecheck` — Expected: only errors in `item-actions.ts`/`item-form.tsx` about `"money"` if any; fix them by treating `"money"` like `"number"` in `inputType` (`item-form.tsx`) with `step="0.01"`.
- [ ] **Step 5: Commit** `Autosave: parse changed fields, amounts to 2 decimals`

### Task 2: SaveQueue

**Files:**
- Create: `lib/save-queue.ts`, `lib/save-queue.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `SaveResult` (Task 1)
- Produces:
  - `type SaveState = "saved" | "saving" | "failed"`
  - `class SaveQueue { constructor(save: (fd: FormData) => Promise<SaveResult>, onUpdate: () => void); change(name: string, value: string): void; retry(): void; idle(): Promise<void>; readonly state: SaveState; readonly result: SaveResult | null; readonly unsaved: boolean }`
  - `change` records the value (latest wins) and starts a save if none is running. A save sends every unsaved field. On success, fields whose value did not change since sending are cleared; `result` = the response. On error or throw (network), all fields stay, `state = "failed"`, and nothing more is sent until the next `change` or `retry`. Changes made while a save runs are sent in one follow-up save when it finishes (if it succeeded). `idle()` resolves when nothing is running. `unsaved` = any field not yet saved. `onUpdate` is called on every state change.

- [ ] **Step 1: Write the failing tests** (a fake `save` that records calls and resolves on demand):
  - "sends only changed fields": `change("a","1")` → one call with `{a:"1"}`; after resolve `state === "saved"`, `unsaved === false`.
  - "queues changes made during a save": `change("a","1")`, `change("b","2")`, `change("a","3")` while first is pending → exactly 2 calls: `{a:"1"}` then `{a:"3", b:"2"}`.
  - "keeps failed fields and sends them with the next change": first resolves `{error:"bad", field:"a"}` → `state === "failed"`, no new call; `change("b","2")` → call with `{a:"1", b:"2"}`.
  - "a thrown save counts as failed": save rejects → `state === "failed"`, `result.error` is a message; `retry()` re-sends `{a:"1"}`.
  - "idle waits for the running save": `await q.idle()` resolves only after the fake resolves.
- [ ] **Step 2: Run** `node --test lib/save-queue.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `lib/save-queue.ts`.** A thrown save becomes `{ error: "Could not reach the server." }`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `Autosave: one save at a time per record`

### Task 3: AutosaveProvider and useAutosave

**Files:**
- Create: `app/autosave.tsx` (`"use client"`)
- Modify: `app/layout.tsx` (wrap the body's content, including `modal`, in `<AutosaveProvider>`)
- Modify: `app/globals.css` (`[aria-invalid="true"]` red outline; reuse existing `.badge`, `.msg`, `.msg.error`)

**Interfaces:**
- Consumes: `SaveQueue`, `SaveState`, `SaveResult`
- Produces:
  - `AutosaveProvider({ children })`
  - `useSaves(): { waitForSaves(): Promise<string[]>; block(key: string, label: string | null): void }` — `waitForSaves` awaits `idle()` of every registered queue and returns the labels of those `failed`; `block(key, label)` registers (label) or clears (null) a reason to warn on leaving that no queue holds (used by New Client)
  - `useAutosave(opts: { key: string; label: string; save: (fd: FormData) => Promise<SaveResult> }): { formRef: RefObject<HTMLFormElement | null>; state: SaveState; error: SaveResult | null; unsaved: boolean; change(name: string, value: string): void; retry(): void }`
  - `AutosaveStatus({ autosave }: { autosave: ReturnType<typeof useAutosave> })` — renders the "Not saved" badge when `unsaved`, "Saving…", "Saved", or "Couldn't save: {error}" + `<button className="link" onClick={retry}>Retry</button>`
  - `FieldError({ autosave, name })` — `<small className="msg error">` when `error.field === name`

Behaviour to build:
- `useAutosave` creates one `SaveQueue` (in a ref), registers it with the provider under `key` + `label`, and unregisters on unmount.
- On the form element (via `formRef`): native `change` listener → `change(target.name, value)` where checkboxes send `"on"`/`"off"`; skip elements without a `name` and the flights hidden input. Native `input` listener marks the record "being typed in" until its `change` fires (counts as unsaved for beforeunload only).
- After a save with `values`: for each `[name, value]`, set `form.elements.namedItem(name)` value (`checked` for checkboxes, `value` for `output`) unless it is `document.activeElement` or the field is unsaved in the queue. On `error.field`, set `aria-invalid="true"` on that element; clear it after a successful save.
- Provider: `beforeunload` → `preventDefault()` when any queue is `unsaved`, any record is being typed in, or any `block` label is set.
- Provider: `document` click listener in capture phase for `a[href]` that is same-origin, no `target`, no `download`, primary button, no modifier keys: if any queue is saving/unsaved or a block is set → `preventDefault()` + `stopPropagation()`, `await waitForSaves()`; then if failures or blocks: `confirm("Some changes could not be saved: <labels>. Leave anyway?")`; navigate with `router.push(href)` if fine or confirmed.
- shortcut: browser back/forward is not intercepted (App Router has no cancellable navigation event); saves already running still finish because the app does not unload. Upgrade if edits get lost that way.

- [ ] **Step 1: Implement `app/autosave.tsx`** and wire the provider into `app/layout.tsx`.
- [ ] **Step 2: Run** `npm run typecheck` and `npm test` — Expected: no errors, tests pass.
- [ ] **Step 3: Commit** `Autosave: provider, leaving guard and form hook`

### Task 4: Item cards autosave

**Files:**
- Modify: `app/quotes/[id]/item-actions.ts` (`saveItem`)
- Modify: `app/quotes/[id]/item-form.tsx` (`ItemForm`, `FlightsTable`, remove `useActionState`, `dirty`, `beforeunload` effect and its `shortcut:` comment, the Save button)
- Modify: `app/quotes/[id]/edit-section.tsx:54` (key becomes `String(row.id)`)

**Interfaces:**
- Consumes: `parseChanged`, `FieldError` (class, Task 1), `SaveResult`, `useAutosave`, `AutosaveStatus`, `FieldError` (component, Task 3; import one of the two under an alias)
- Produces: `saveItem(quoteId: string, table: string, id: string, formData: FormData): Promise<SaveResult>`

Server (`saveItem`):
- Parse with `parseChanged([...ITEM_FIELDS[table], ...PRICE_FIELDS, ...FEE_FIELDS as money fields], formData)`; `fee_region`, `variant`, `stay_id`, `ten_percent_fee` and `flights` only when present (`formData.has`), with today's checks. A `FieldError` → `{ error: e.message, field: e.field }`.
- `merged = { ...prev, ...changed }`; flights = parsed `flights` if sent, else the stored flights for the option (needed by `autoRegion`). Run `fillFlightNames`, `autoRegion`, `applyFees` on `merged` as today.
- Update only: changed columns + `fee_region`, `variant`, the four `FEE_FIELDS`. Call `replace_flights` only if `flights` was sent.
- Return `{ values }` with `fee_region`, `variant` and the four fees as strings (`""` for null). Keep `revalidatePath`.

Client (`ItemForm`):
- `useAutosave({ key: id, label: \`${ITEM_LABEL[table]}: ${str(row[ITEM_FIELDS[table][0].name]) || "untitled"}\`, save: (fd) => saveItem(quoteId, table, id, fd) })`; `<form ref={formRef}>` without `action`; `<AutosaveStatus>` in `.item-actions` next to Delete; `<FieldError>` under each field.
- `FlightsTable` gets `onChange(json: string)` and calls it after drag-drop, remove, "+ Add flight", and on each cell input's `onBlur` when the list changed since the last call; `ItemForm` passes `(json) => change("flights", json)`. Drop the hidden `flights` input.
- `Delete` keeps its `ConfirmButton` (`formAction`), so the card stays a `<form>`. Requirement: pressing Enter in a text box must neither reload the page nor delete or arm Delete (implicit submission uses the first submit button), and Delete must still work. Check how `app/confirm-button.tsx` renders before choosing how.

- [ ] **Step 1: Change `saveItem`** as above.
- [ ] **Step 2: Change `ItemForm`, `FlightsTable`, `edit-section.tsx`** as above.
- [ ] **Step 3: Run** `npm run typecheck && npm test` — Expected: pass.
- [ ] **Step 4: Manual check** (`npm run dev`, a Quote with a flight and a hotel): edit Price → tab away → "Saved", reload shows it. Type "12.345" → error under Price, "Not saved". Then edit Notes → still not saved; fix Price → both saved. Change Fee region while the cursor is in Transaction fee and typing → that box keeps the typed text. Drag a flight → saved. Edit a field, click a nav link at once → page changes only after "Saved".
- [ ] **Step 5: Commit** `Autosave Item cards`

### Task 5: Generate version saves first

**Files:**
- Modify: `app/quotes/[id]/generate-version-button.tsx`

**Interfaces:**
- Consumes: `useSaves().waitForSaves`

- [ ] **Step 1:** Replace `<form action={action}>` with an `onSubmit` that calls `preventDefault()`, `await waitForSaves()`; if it returns labels, show `Couldn't save these, so nothing was generated: <labels joined by ", ">` in the existing `.msg.error` style; else `startTransition(() => action(new FormData()))`. The button shows "Saving…" while waiting.
- [ ] **Step 2: Run** `npm run typecheck` — Expected: pass.
- [ ] **Step 3: Manual check:** type a new Price and click Generate version without leaving the box → the Version's PDF shows the new price. With a bad Price on a card → message names that Item, no Version created.
- [ ] **Step 4: Commit** `Generate version waits for autosave`

### Task 6: Trip form autosave

**Files:**
- Modify: `app/trips/actions.ts` (`saveTrip`), `app/trips/[id]/trip-form.tsx`

**Interfaces:**
- Produces: `saveTrip(tripId: string, formData: FormData): Promise<SaveResult>`

- [ ] **Step 1: `saveTrip`:** read the stored trip; validate only fields present (`formData.has`), each failure returning `field`; check end-before-start on the stored dates merged with the sent ones; update only sent columns; return `{ values: { nights } }` (string, `""` for null) re-read after the update.
- [ ] **Step 2: `TripForm`:** `useAutosave({ key: trip.id, label: "Trip details", save })`; remove Save button; Nights becomes `<output name="nights">`; `<FieldError>` under status, dates, adults, children; `<AutosaveStatus>` at the bottom.
- [ ] **Step 3: Run** `npm run typecheck` — Expected: pass. Manual: change Travel to → Nights updates; set Travel to before Travel from → error under it, nothing saved.
- [ ] **Step 4: Commit** `Autosave the Trip form`

### Task 7: Stays autosave

**Files:**
- Modify: `app/trips/stay-actions.ts` (`saveStay`), `app/trips/[id]/stays-form.tsx`, `app/trips/[id]/trip-view.tsx:92` (key `s.id`)

**Interfaces:**
- Produces: `saveStay(tripId: string, stayId: string | null, formData: FormData): Promise<SaveResult>`

- [ ] **Step 1: `saveStay`:** for an existing Stay, partial like `saveTrip` (merge stored dates for the end-before-start check; `destination` name re-read only when `destination_code` is sent). For a new Stay (`stayId` null), as today: requires `destination_code`, inserts with whatever other fields are sent.
- [ ] **Step 2: `StayRow`:** existing rows use `useAutosave({ key: stay.id, label: \`Stay: ${destination label}\`, save })`, Save button removed, Delete kept, `<AutosaveStatus>` in the actions cell. The empty row keeps plain behaviour: picking a Destination calls `saveStay(tripId, null, fd)` with the row's current values (a `useTransition`), no button; on error show it in the cell. After creation the page refresh renders the new row (keyed by id) and a fresh empty row; focus the new Stay's Arrive input (pass `autoFocus` to the last existing row when its id was not in the previous render, or leave focus alone if that proves fiddly and say so in the commit).
- [ ] **Step 3: Run** `npm run typecheck` — Expected: pass. Manual: pick a Destination in the empty row → Stay created, new empty row appears; change its dates → saved; Depart before Arrive → error, not saved.
- [ ] **Step 4: Commit** `Autosave Stays`

### Task 8: Client form autosave and New Client

**Files:**
- Modify: `app/clients/actions.ts` (`saveClient` split), `app/clients/client-forms.tsx` (`ClientForm`)

**Interfaces:**
- Produces:
  - `updateClient(id: string, formData: FormData): Promise<SaveResult>` — partial; `first_name`/`last_name` sent empty → `{ error: "Enter a first and last name.", field }`; `active` from `"on"`/`"off"`; `consultant_id` only for admins (as today); same RLS zero-rows message.
  - `createClient(formData: FormData): Promise<SaveResult>` — today's insert branch and redirects (`next=trip` → `/trips/new?client=<id>`, else `/clients/<id>`), unchanged. (Name it `addClient` if `createClient` clashes with the Supabase import.)

- [ ] **Step 1: Split `saveClient`** into the two actions; update every caller (`grep -rn saveClient app`).
- [ ] **Step 2: Edit form** (`client` given): `useAutosave({ key: client.id, label: "Client details", save: (fd) => updateClient(client.id, fd) })`, button removed, `<AutosaveStatus>`, `<FieldError>` under the names.
- [ ] **Step 3: New Client form** (no `client`): no button. While both names are non-empty (trimmed) and not yet created, `block("new-client", "New client (not yet added)")`, else `block("new-client", null)`. Create (once, guarded by a ref) when, with both names filled, a `pointerdown` or `focusin` on `document` lands outside the form element. Window/tab switches fire neither, so they never create. Creation submits the whole form via `startTransition(() => addClient(new FormData(form)))`; clear the block first so the redirect is not warned about; show an error in the form if it returns one.
- [ ] **Step 4: Run** `npm run typecheck` — Expected: pass. Manual: New Client, type both names, alt-tab away and back → nothing created; click the page header → Client created, lands on its page; from New Trip → back with Client chosen. Edit form: untick Active → saved.
- [ ] **Step 5: Commit** `Autosave the Client form; New Client adds itself when you move on`

### Task 9: Wrap up

**Files:**
- Modify: `README.md:113` (milestone 4 struck through: `~~Edit screen: autosave ...~~ Done: fields save as you leave them`)

- [ ] **Step 1: Run** `npm test && npm run typecheck && npm run build` — Expected: all pass.
- [ ] **Step 2: Run** `grep -rn "useActionState" app/quotes/[id]/item-form.tsx app/trips/[id]/trip-form.tsx app/trips/[id]/stays-form.tsx app/clients/client-forms.tsx` — Expected: only `DocumentUploadForm` remains.
- [ ] **Step 3: Commit** `README: milestone 4 done`
