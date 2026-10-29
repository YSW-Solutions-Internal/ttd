# Edit screen autosave: design

README milestone 4. Agreed with the user in a grilling session on 2026-10-27.

## Why

Editing a Quote means filling in many Item cards. Each card has its own Save button. An edit someone forgot to save is lost when they follow a link inside the app (the warning covers only reloading and closing the tab; see the `shortcut:` comment in `app/quotes/[id]/item-form.tsx`), and Generate version freezes what is in the database, so an unsaved edit is silently left out of the Version. Autosave removes the forgotten-Save problem.

Success: staff never press Save on a record that already exists, and no edit is lost or left out of a Version without them being told.

## Goals

- Edits to existing records save themselves, field by field.
- Staff always see whether a record is saving, saved, or could not be saved.
- Nothing is lost by leaving the page, and nothing unsaved goes into a Version.

## Non-goals

- Changing a Trip's Client after creation (the Trip reference is built from the Client code at creation; separate feature).
- Re-placing Items or recalculating their fees when a Stay changes. Saving a Stay never changes Items by itself, as today.
- Locking or conflict warnings when two people edit the same record.
- Automatic retries.

## Anti-goals

- A card reloading or the cursor jumping while someone is typing.
- A permanent value (a Client code, a Trip reference) created from half-typed input.
- A Version generated without an edit the Consultant made.

## Which forms

**Autosave:**

| Form | File |
|------|------|
| Item cards on the Quote edit screen, including a Flight option's flights table | `app/quotes/[id]/item-form.tsx`, `item-actions.ts` |
| Trip form | `app/trips/[id]/trip-form.tsx`, `app/trips/actions.ts` (`saveTrip`) |
| Existing Stay rows | `app/trips/[id]/stays-form.tsx`, `app/trips/stay-actions.ts` |
| Client edit form | `app/clients/client-forms.tsx`, `app/clients/actions.ts` (`saveClient`) |
| New Client (see below) | same |
| The empty "add Stay" row (see below) | `stays-form.tsx` |

**Keep their button:** New Trip ("Create trip"; a Trip's Client and reference are permanent), Add by hand (the click is already the creation), airline-name confirmations, image uploads, Client document uploads, inviting Users, changing roles, passwords, login, Delete buttons.

## When a save happens

- Text, number, date, time and textarea fields: when the cursor leaves the field, and only if its value changed (the `change` event).
- Selects and checkboxes: as soon as they change.
- A Flight option's flights table is one unit. It saves when a flight is dragged to a new place, removed or added ("+ Add flight" saves the new empty row), and when the cursor leaves a cell whose value changed. The whole list is sent, since rows renumber each other.
- A save sends only the fields that changed. The server writes only those columns, so two people editing the same record overwrite each other only on the exact same field (last save wins). This means `saveItem`, `saveTrip`, `saveStay` and `saveClient` must accept partial input; today they read and write every field of the form.
- Saves for one record must not overtake each other: a later save of a record must not be overwritten by an earlier one finishing late.
- For Items, the server merges the changed fields into the stored row before working out the Fee region and fees (`autoRegion`, `applyFees`), so they are calculated from the whole Item, not just the changed fields. The database triggers on these tables only set `updated_at` and protect the Client code, so they work with partial updates.

### New Client

The Client is created when both first and last name are filled in and the user clicks or tabs to something on the page outside the New Client form card. Moving between fields, or clicking blank space inside the card, never creates it. Switching to another window or browser tab does not count either (someone looking up an email address must not create the Client) _(builder-check call, not discussed with the user)_. The Client code is generated at creation and never changes, which is why it waits.

If the tab is closed or a link followed while both names are filled and the Client is not yet created, the browser's "Leave site?" warning shows instead of creating the Client.

After creation, the user lands where today's `saveClient` redirects go: the Client's page (whose edit form then autosaves), or back to New Trip with this Client chosen when they came from there (`next=trip`). The "Add client" button goes.

### The empty "add Stay" row

Picking a Destination creates the Stay. Its dates and highlight then autosave like any existing Stay, and a fresh empty row appears below. The "Add" button goes.

## What staff see

- The per-record Save buttons go. Each record (Item card, Trip form, Stay row, Client form) shows its state: "Saving…", "Saved", or "Couldn't save: <reason>" with a **Retry** link, and the "Not saved" mark while it has unsaved or failed changes.
- Values the server fills in on save (an Item's fees and Fee region, a Trip's Nights) update in place. The field the cursor is in is never overwritten. The card does not re-mount after a save; today it does, because of the `key={`${row.id}-${row.updated_at}`}` in `edit-section.tsx`, and that must stop.
- A failed save (bad value or lost connection) keeps the "Not saved" mark until a save goes through. Retrying is the user's choice.

## Validation

- A value that cannot be saved holds the whole record unsaved, with the error shown next to that field. Until it is fixed, every later save of that record carries the bad value with the new changes, so it fails too and nothing on that record is written. The client therefore keeps the set of unsaved fields per record, and Retry sends all of them. This also covers checks across two fields: if the start date is moved past the end and then the end is fixed, the second save carries both dates.
- Price, Markup, Transaction fee, Change fee, Refund fee and Pre-payment fee accept at most 2 decimal places. More is rejected with an error next to the field (e.g. "1200.505"). Today any number `Number()` reads goes through, including "1e3". Amounts already stored with more decimals stay until someone edits that field; since saves are per field, an untouched field is never re-checked.
- Other validation stays as it is today (e.g. Trip adults and children required, Stay destination required, Client names required).

## Leaving the page

A record counts as unsaved while a save is running or has failed, while the field with the cursor holds an edit not yet saved (no `change` event fires on closing the tab), or while a New Client has both names and is not yet created.

- **Reload or closing the tab:** the browser's "Leave site?" warning shows while anything is unsaved.
- **In-app links and back/forward:** clicking a link moves the cursor out of the field first, which starts its save. Navigation waits for the running saves to finish, then goes ahead. It stops with a warning only if a save fails, or if a New Client is not yet created _(builder-check call: warning on every link clicked right after an edit would be noise)_.

This replaces today's reload-and-close-only warning in `item-form.tsx` and removes its `shortcut:` comment.

## Generate version

Generate version saves first, then generates. Clicking the button moves the cursor out of the field it was in, which starts that field's save. Generate version waits until every save on the screen has finished. If any record could not be saved, it stops, names the Item, and generates nothing. Otherwise it runs as today (`generateVersion` in `app/quotes/[id]/pdf-actions.ts`, with its own checks on unplaced Accommodation and missing Transaction fees). The glossary's Generate version entry records this rule.

## Left to the builder

- How saving state is shared across the screen so Generate version and the leaving warning can see it (a React context, a small store, etc.).
- How in-app navigation is intercepted in the Next.js App Router.
- The wording of status messages and errors beyond what is given here.
- How the 2-decimal check is done (shared helper used by all amount fields; the inputs may also get `step="0.01"`).
- Tests: at least the 2-decimal check and the partial-save parsing on the server.
