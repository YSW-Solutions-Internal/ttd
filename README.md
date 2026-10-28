# TTD Quotes

Staff-only web app for building travel quotes: upload supplier screenshots, extract data with AI, correct it, and produce one PDF per quote version.

**Stack:** Next.js 16 (TypeScript, App Router) · Supabase (Auth, Postgres, private Storage) · Claude API (image extraction) · Puppeteer with `@sparticuz/chromium` for PDFs

## What works now

- Email and password sign-in; every page except `/login` requires it
- Invitation-only accounts with two roles, **Administrator** and **Standard user**. Administrators invite staff by email from the Users page (`/admin/users`) and change roles, including promoting someone to administrator. Invited users follow the email link and choose their password. Anyone can request a password reset from Sign in; the same Set password screen finishes it. Standard users never see the page and are redirected away from it
- Clients (`/clients`): add and edit clients (first and last name, email, phone, notes, active), upload their ID and passport copies and open them in a new tab. The client code (`RWOL01`: first initial, three letters of the surname, two digits) is made by the database and never changes
- Every client has one Consultant. Standard users see and work on only their own clients and everything under them (documents, trips, quotes, files); administrators see everything and hand clients over. Enforced in the database (see `docs/adr/0001-access-follows-client-consultant.md`)
- Trips (`/`, `/trips/new`): create a trip for a client (`TRIP-RWOL01-001`), then add quotes to it (`QU-RWOL01-001`)
- Upload screenshots to a private bucket
- Duplicate images within a quote are detected by SHA-256 and skipped
- Removing an image is a soft remove; re-uploading the same file restores it
- **Extract data** button: sends each image that has no finished extraction to Claude (one call per image, answer forced into a JSON schema), stores the JSON in `extractions`, and shows it read-only on the quote page
- Images already extracted with the current prompts are never sent again (revisions only process new images)
- Database schema ready for Items (one table per kind, read from images or entered by hand), the AI call log, versions, booking tracking, fee schedules and destinations

- PDF renderer (`lib/pdf/`): quote JSON in the shape of `lib/pdf/sample-quote.json` -> the quotation template -> an A4 PDF. A Version whose PDF failed shows **PDF failed** and **Retry** in the Versions table; the retry renders the Version's frozen JSON, and a Version that has its PDF is never rendered again (see `docs/adr/0006-pdf-rendered-by-chromium-from-frozen-version.md`)

- **Generate version** on the Quote page: checks the Quote (every Accommodation option placed in a Stay, every priced Item has its Transaction fee), assembles the Trip, Stays and Items into quote JSON in code (`lib/pdf/assemble.ts`), saves it with its Items as the next Version, then renders its PDF. Only confirmed airline names are printed; otherwise the code is shown

## Setup

1. Create a Supabase project. Choose the South Africa (Cape Town) region if offered.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
   Then run `0002_boards_alignment.sql` (clients, trips, client-based references, item selection per version, booking tracking, fee schedules, final-version lock), `0003_seed_destinations.sql` (111 destinations), `0004_seed_fee_schedule.sql` (Ore and Metal 2025 tariff), `0005_user_roles.sql` (roles and invitation-only accounts) `0006_tighten_access.sql` (only admins delete records and files or change pricing settings; emails cannot be changed) `0007_clients_and_access.sql` (client codes, Consultants, access per Consultant) `0008_fee_rates.sql` (the VAT-inclusive fee grid per Item type and Fee region) `0009_item_tables_and_ai_log.sql` (Item tables, AI call log; wipes existing extractions, which are test data) `0010_stays_and_flight_editing.sql` (Accommodation options placed in Stays, saving a Flight option's flights in one go) `0011_rand_only.sql` (drops currency and the printed price: every price is in Rand), `0012_airlines_aircraft_flight_names.sql` (airline and aircraft names, airport names and booking class on flights) and `0013_seed_airlines_aircraft.sql` (generated from OpenFlights, ODbL, by `scripts/build-airline-aircraft-seed.py`; airline names go in unconfirmed), then `0014_shorter_extraction_lock.sql` (a stuck extraction can be retried after 5 minutes). Then `0015_versions_final_from_birth.sql` (no draft versions: a Version is read-only from the start, and only its missing PDF can be filled in). Then `0016_one_quote_per_trip.sql` (one Quote per Trip, created with it) and `0017_background_extraction.sql` (the Extract button queues images and the cron reads them; failed images wait for the button), then `0018_generate_version.sql` (saves a Version and its Items together). 0007 stops if `public.clients` has rows; the message tells you what to delete.
   0002 is a **draft**: it stops if `public.quotes` has rows (old data is discarded by design). Read the notes at its top first.
3. Accounts are by invitation only, and the database enforces it (0005): any new account that does not match an admin's invitation is rejected, whatever the dashboard's sign-up settings say.
4. Make yourself an administrator. 0005 sets every existing account to Standard user, so run this once in the SQL editor:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

   From then on, invite staff at `/admin/users`.
5. Authentication -> Emails -> Templates. In **Invite user**, replace `{{ .ConfirmationURL }}` with

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
   ```

   and in **Reset password** with

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
   ```

   With the default invite link, people land on Sign in instead of choosing a password. Supabase only lets you edit templates once custom SMTP is set up; until then the default reset link still works if you add `<app address>/**` (e.g. `http://localhost:3000/**`) to Authentication -> URL Configuration -> Redirect URLs, and the person opens it in the browser they requested it from. Then set Authentication -> URL Configuration -> Site URL to the app's address, and the minimum password length to 8 (Authentication -> Policies) to match the form. Invite and reset emails need SMTP configured.
6. Set these environment variables locally and in Vercel (Project Settings -> Environment Variables). The Supabase values are under Project Settings -> API; the Anthropic key comes from console.anthropic.com:

   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ANTHROPIC_API_KEY
   CRON_SECRET
   ```

   `CRON_SECRET` is any long random string. Vercel sends it to the extraction cron (`vercel.json`, every minute; needs the Pro plan), and the route refuses calls without it. Locally the cron does not run: images are read right after the click, and anything left over can be read with `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/extract`.

   Locally only, also set `CHROME_PATH` to a Chrome 138 or chrome-headless-shell 138 executable, so PDFs can render (Vercel uses the Linux Chromium from `@sparticuz/chromium` instead). One way to get it: `npx @puppeteer/browsers install chrome-headless-shell@138.0.7204.168`.
7. Install and run:

   ```bash
   npm install
   npm run dev
   npm test        # unit tests (Node's built-in runner)
   ```

8. Open http://localhost:3000 and sign in.

## Layout

```
app/                      pages and server actions
  login/                  sign-in
  admin/users/            admin-only: invite users, change roles
  clients/                client list, add/edit, documents (View opens a one-minute signed link)
  trips/                  new trip, trip page with its quotes
  login/forgot/           request a password reset email
  auth/confirm/           invite and reset link landing: token -> session
  account/set-password/   invited or resetting user chooses a password
  quotes/[id]/            quote page: image upload, image list, versions
proxy.ts                  session refresh + redirect to /login (Next 16 name for middleware)
lib/auth.ts               getProfile, requireAdminPage, requireAdminAction
lib/roles.ts              role names and labels (safe to import in Client Components)
lib/supabase/server.ts    Supabase client for server code
lib/supabase/admin.ts     service-role client, used only to send invites
lib/hash.ts               SHA-256 helper used for duplicate detection
lib/extraction/           prompt (with PROMPT_VERSION), its JSON schema, the Claude call, parsing, item types
lib/pdf/                  quote JSON types and sample, the quotation template, money formatting, HTML -> PDF
supabase/migrations/      database schema, RLS, storage bucket
```

## Design notes

- **Items** are rows in one table per kind (`flight_options` with child `flights`, `accommodation_options`, `car_rentals`, `transfers`, `rail_journeys`, `excursions`). Consultants correct them in place. A hand-entered Item is a row with no `image_id`. `quote_items` lists a Quote's Items, leaving out those whose image was removed (ADR 0005).
- **Extractions** hold one row per image: whether it has been read. An image is read once, ever, so a revision only sends new images to the AI.
- **`ai_calls`** logs every call to Claude with its raw answer, tokens and errors, for debugging. Nothing reads it to build a Quote.
- RLS (ADR 0010, migration 0021): every signed-in User reads every Client, Trip, Quote and Item; `can_edit()` lets Standard users and Administrators write, never Accountants. Client documents and their files stay with the Client's Consultant and Administrators (`can_access_client`). Only an Administrator hands a Client over (`guard_consultant` trigger). `trips.consultant_id` and `quotes.owner_id` are labels and grant no access.
- **History** is written by the `record_history` trigger on every business table, so no server action can skip it. Entries cannot be changed or removed through the API; an empty `user_id` means the background extraction or cron.
- **Invitation-only** is enforced by `handle_new_user`: every new auth user must match an open row in `invitations`, which only admins can write, and the role comes from that row. Anything else that tries to create an account (public sign-up, magic link, OAuth, the dashboard's own Add/Invite user) fails.
- **Roles** are enforced in the app and again in the database. Every user-management server action calls `requireAdminAction()` first, because a server action can be posted to directly, not just from our own UI; hiding the nav link is cosmetic. Underneath, the `guard_role_change` trigger refuses any role change not made by an admin, and refuses to demote the last admin. Role changes run with the admin's own session, not the service key, so the trigger always sees who is asking.
- Role is read from the database on every request, so promoting or demoting someone takes effect immediately rather than when their session expires.

## Next milestones

Done: 1. airport table loader · 2. background extraction (ADR 0008) · 3. deterministic assembler (`lib/pdf/assemble.ts`) · 4. autosave on the edit screen · 5. Generate version button · 6. Trips list Consultant filter · 7. Access, Accountant and History (migration 0021).

### Bookings and accounts (Lisa's brief, phase 1)

The app takes over what Lisa's SharePoint pilot and developer brief describe: from booking an Item to its supplier and Client invoices, payments, refunds and commissions (ADR 0009). Terms are in `GLOSSARY.md`; open business questions for Lisa are in `docs/questions.md`. One `feat/` branch per step, each usable on its own.

7. **Access and Accountant**: every User sees every Client and Trip, Client documents stay with the Consultant and Administrators (ADR 0010); the Accountant role; History of every edit from the moment a record is entered (who, when, before and after)
8. **Clients and Travellers**: company Clients (`OREA01`), reusable Travellers on a Trip, Trip status Enquiry / Quoted / Confirmed / Travelled / Cancelled, TA number, cost centre and authorising person on corporate Trips
9. **Booking**: book and unbook Items, the supplier's actual currency, amount and rate, the expected supplier-invoice date, Changes and Cancellations; booked Items are locked (ADR 0011). Charges the Transaction fee when the Client cancels before issue
10. **Invoices**: Supplier invoices and Client invoices (Quicktrav PDFs) linked to Items and Changes with an amount each, the calculated invoicing stage (ADR 0012), and `/accounts` with its queues: awaiting (overdue first), to verify, to invoice, queries, unlinked documents
11. **Payments**: Payment accounts kept by Administrators (nicknames only), the Payment ledger with partial payments and reversals, reconciliation status, month-end CSV per Payment account
12. **Refunds and Commissions**
13. **New kinds and pricing**: Package, Visa and Insurance Items, the Trip checklist (replaces visa/health/insurance info), the Card surcharge, Online saving on Flight options
14. **Search and departures**: one search box over references, Clients, Travellers, PNRs, ticket and invoice numbers; departing and returning this week on the home page; Trips list hides Travelled and Cancelled Trips older than 90 days unless asked; nothing with money on it can be deleted

### Afterwards

15. Review the Trips list for pagination once there are a few hundred trips
16. Finalising a Quote: decide when a Version gets a total for the whole Trip
17. Archiving Items instead of deleting them, so a deleted Item can be restored
18. A developer view of what the AI read from each image (raw `ai_calls` answers)
19. A page for Administrators to correct or remove Destinations

### Phase 2

Reminders (package balances, visa deadlines, overdue supplier invoices; anything to Clients reviewed before sending), card and bank statement import and matching, corporate spend reports, signing in with a Microsoft account.
