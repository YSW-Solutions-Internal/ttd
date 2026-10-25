# TTD Quotes

Staff-only web app for building travel quotes: upload supplier screenshots, extract data with AI, correct it, and produce one PDF per quote version.

**Stack:** Next.js 16 (TypeScript, App Router) · Supabase (Auth, Postgres, private Storage) · Claude API (image extraction) · Puppeteer for PDFs (next milestone)

## What works now

- Email and password sign-in; every page except `/login` requires it
- Invitation-only accounts with two roles, **Administrator** and **Standard user**. Administrators invite staff by email from the Users page (`/admin/users`) and change roles, including promoting someone to administrator. Invited users follow the email link and choose their password. Standard users never see the page and are redirected away from it
- Clients (`/clients`): add and edit clients (first and last name, email, phone, notes, active), upload their ID and passport copies and open them in a new tab. The client code (`RWOL01`: first initial, three letters of the surname, two digits) is made by the database and never changes
- Every client has one Consultant. Standard users see and work on only their own clients and everything under them (documents, trips, quotes, files); administrators see everything and hand clients over. Enforced in the database (see `docs/adr/0001-access-follows-client-consultant.md`)
- Trips (`/`, `/trips/new`): create a trip for a client (`TRIP-RWOL01-001`), then add quotes to it (`QU-RWOL01-001`)
- Upload screenshots to a private bucket
- Duplicate images within a quote are detected by SHA-256 and skipped
- Removing an image is a soft remove; re-uploading the same file restores it
- **Extract data** button: sends each image that has no finished extraction to Claude (one call per image, answer forced into a JSON schema), stores the JSON in `extractions`, and shows it read-only on the quote page
- Images already extracted with the current prompts are never sent again (revisions only process new images)
- Database schema ready for Items (one table per kind, read from images or entered by hand), the AI call log, versions, booking tracking, fee schedules and destinations

Not built yet: the edit screen, quote assembly, versions and PDF generation, airport loading, fee lookup in code.

## Setup

1. Create a Supabase project. Choose the South Africa (Cape Town) region if offered.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
   Then run `0002_boards_alignment.sql` (clients, trips, client-based references, item selection per version, booking tracking, fee schedules, final-version lock), `0003_seed_destinations.sql` (111 destinations), `0004_seed_fee_schedule.sql` (Ore and Metal 2025 tariff), `0005_user_roles.sql` (roles and invitation-only accounts) `0006_tighten_access.sql` (only admins delete records and files or change pricing settings; emails cannot be changed) `0007_clients_and_access.sql` (client codes, Consultants, access per Consultant) `0008_fee_rates.sql` (the VAT-inclusive fee grid per Item type and Fee region) and `0009_item_tables_and_ai_log.sql` (Item tables, AI call log; wipes existing extractions, which are test data). 0007 stops if `public.clients` has rows; the message tells you what to delete.
   0002 is a **draft**: it stops if `public.quotes` has rows (old data is discarded by design). Read the notes at its top first.
3. Accounts are by invitation only, and the database enforces it (0005): any new account that does not match an admin's invitation is rejected, whatever the dashboard's sign-up settings say.
4. Make yourself an administrator. 0005 sets every existing account to Standard user, so run this once in the SQL editor:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

   From then on, invite staff at `/admin/users`.
5. Authentication -> Emails -> **Invite user** template: set the link to

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
   ```

   and set Authentication -> URL Configuration -> Site URL to the app's address. Invite emails need SMTP configured.
6. Set these environment variables locally and in Vercel (Project Settings -> Environment Variables). The Supabase values are under Project Settings -> API; the Anthropic key comes from console.anthropic.com:

   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ANTHROPIC_API_KEY
   ```
7. Install and run:

   ```bash
   npm install
   npm run dev
   ```

8. Open http://localhost:3000 and sign in.

## Layout

```
app/                      pages and server actions
  login/                  sign-in
  admin/users/            admin-only: invite users, change roles
  clients/                client list, add/edit, documents (View opens a one-minute signed link)
  trips/                  new trip, trip page with its quotes
  auth/confirm/           invite link landing: token -> session
  account/set-password/   invited user chooses a password
  quotes/[id]/            quote page: image upload, image list, versions
proxy.ts                  session refresh + redirect to /login (Next 16 name for middleware)
lib/auth.ts               getProfile, requireAdminPage, requireAdminAction
lib/roles.ts              role names and labels (safe to import in Client Components)
lib/supabase/server.ts    Supabase client for server code
lib/supabase/admin.ts     service-role client, used only to send invites
lib/hash.ts               SHA-256 helper used for duplicate detection
lib/extraction/           prompt (with PROMPT_VERSION), its JSON schema, the Claude call, parsing, item types
supabase/migrations/      database schema, RLS, storage bucket
```

## Design notes

- **Items** are rows in one table per kind (`flight_options` with child `flights`, `accommodation_options`, `car_rentals`, `transfers`, `rail_journeys`, `excursions`). Consultants correct them in place. A hand-entered Item is a row with no `image_id`. `quote_items` lists a Quote's Items, leaving out those whose image was removed (ADR 0005).
- **Extractions** hold one row per image: whether it has been read. An image is read once, ever, so a revision only sends new images to the AI.
- **`ai_calls`** logs every call to Claude with its raw answer, tokens and errors, for debugging. Nothing reads it to build a Quote.
- RLS: a standard user sees only clients they are the Consultant for, and everything under them. `trips.consultant_id` and `quotes.owner_id` are labels and grant no access.
- **Invitation-only** is enforced by `handle_new_user`: every new auth user must match an open row in `invitations`, which only admins can write, and the role comes from that row. Anything else that tries to create an account (public sign-up, magic link, OAuth, the dashboard's own Add/Invite user) fails.
- **Roles** are enforced in the app and again in the database. Every user-management server action calls `requireAdminAction()` first, because a server action can be posted to directly, not just from our own UI; hiding the nav link is cosmetic. Underneath, the `guard_role_change` trigger refuses any role change not made by an admin, and refuses to demote the last admin. Role changes run with the admin's own session, not the service key, so the trigger always sees who is asking.
- Role is read from the database on every request, so promoting or demoting someone takes effect immediately rather than when their session expires.

## Next milestones

1. Airport table loader (replaces the monday.com Airport Ref board; waiting for the real airport export)
2. Move extraction into a background job runner (it currently runs inside the page request)
3. Deterministic assembler: the Quote's Item rows, then pricing, into quote JSON
4. Edit screen (form and side-by-side with image), in the Edit section of the Quote modal
5. Render service: port `render_lib.py` and the template, Puppeteer PDF into storage, one per version
6. Trips list: filter by Consultant, for admins
7. Review the Trips list for pagination once there are a few hundred trips (it loads and sorts every matching trip today)
8. Booking status per Item (booked, issued, cancelled), charging the Transaction fee when the Client cancels before issue
9. Finalising a Quote: decide when a Version gets a total for the whole Trip (quotes show Item totals only until then)
