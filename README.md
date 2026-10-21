# TTD Quotes

Staff-only web app for building travel quotes: upload supplier screenshots, extract data with AI, correct it, and produce one PDF per quote version.

**Stack:** Next.js 16 (TypeScript, App Router) · Supabase (Auth, Postgres, private Storage) · Claude API (next milestone) · Puppeteer for PDFs (next milestone)

## What works now

- Email and password sign-in; every page except `/login` requires it
- Invitation-only accounts with two roles, **Administrator** and **Standard user**. Administrators invite staff by email from the Users page (`/admin/users`) and change roles, including promoting someone to administrator. Invited users follow the email link and choose their password. Standard users never see the page and are redirected away from it
- Create a quote: pick an existing client or type a new name, optional trip title. The database creates the client (code like `RW001` from initials), the trip (`TRIP-RW001-001`) and the quote (`QU-RW001-001`) in one step
- Upload screenshots to a private bucket
- Duplicate images within a quote are detected by SHA-256 and skipped
- Removing an image is a soft remove; re-uploading the same file restores it
- **Extract data** button: sends each image that has no finished extraction to Claude (classify, then extract), stores the JSON in `extractions`, and shows it read-only on the quote page
- Images already extracted with the current prompts are never sent again (revisions only process new images)
- Database schema ready for extractions, corrections (overrides), manual items, versions, booking tracking, fee schedules and destinations

Not built yet: the edit screen, quote assembly, versions and PDF generation, airport loading, fee lookup in code.

## Setup

1. Create a Supabase project. Choose the South Africa (Cape Town) region if offered.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
   Then run `0002_boards_alignment.sql` (clients, trips, client-based references, item selection per version, booking tracking, fee schedules, final-version lock), `0003_seed_destinations.sql` (111 destinations), `0004_seed_fee_schedule.sql` (Ore and Metal 2025 tariff), `0005_user_roles.sql` (roles and invitation-only accounts) and `0006_tighten_access.sql` (only admins delete records and files or change pricing settings; emails cannot be changed).
   0002 is a **draft**: it stops if `public.quotes` has rows (old data is discarded by design). Read the notes at its top first.
   The app needs 0002 to be run: its New quote form calls `start_quote()`.
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
6. `cp .env.example .env.local` and fill in the project URL and keys (Project Settings -> API).
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
  auth/confirm/           invite link landing: token -> session
  account/set-password/   invited user chooses a password
  quotes/[id]/            quote page: image upload, image list, versions
proxy.ts                  session refresh + redirect to /login (Next 16 name for middleware)
lib/auth.ts               getProfile, requireAdminPage, requireAdminAction
lib/roles.ts              role names and labels (safe to import in Client Components)
lib/supabase/server.ts    Supabase client for server code
lib/supabase/admin.ts     service-role client, used only to send invites
lib/hash.ts               SHA-256 helper used for duplicate detection
lib/extraction/           prompts (with PROMPT_VERSION), the Claude call, JSON parsing, item types
supabase/migrations/      database schema, RLS, storage bucket
```

## Design notes

- **Corrections** live in `overrides`, keyed to an item's `entity_id` and field, not to an image. They are applied on top of the AI output every time a version is assembled, so they survive revisions and image removal.
- **Extractions** are keyed to the image, so a revision only sends new images to the AI.
- **Manual items** (`manual_items`) hold flights, hotels, etc. entered by hand with no source image.
- RLS: any signed-in user is staff and can see all quotes. Tighten with `created_by` checks if needed.
- **Invitation-only** is enforced by `handle_new_user`: every new auth user must match an open row in `invitations`, which only admins can write, and the role comes from that row. Anything else that tries to create an account (public sign-up, magic link, OAuth, the dashboard's own Add/Invite user) fails.
- **Roles** are enforced in the app and again in the database. Every user-management server action calls `requireAdminAction()` first, because a server action can be posted to directly, not just from our own UI; hiding the nav link is cosmetic. Underneath, the `guard_role_change` trigger refuses any role change not made by an admin, and refuses to demote the last admin. Role changes run with the admin's own session, not the service key, so the trigger always sees who is asking.
- Role is read from the database on every request, so promoting or demoting someone takes effect immediately rather than when their session expires.

## Next milestones

1. Airport table loader (replaces the monday.com Airport Ref board; waiting for the real airport export)
2. Move extraction into a background job runner (it currently runs inside the page request) and replace the starter prompts with your canonical agent prompts
3. Deterministic assembler: AI data, then overrides and manual items, then pricing, into quote JSON
4. Edit screen (form and side-by-side with image)
5. Render service: port `render_lib.py` and the template, Puppeteer PDF into storage, one per version
