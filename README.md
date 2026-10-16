# TTD Quotes

Staff-only web app for building travel quotes: upload supplier screenshots, extract data with AI, correct it, and produce one PDF per quote version.

**Stack:** Next.js 16 (TypeScript, App Router) · Supabase (Auth, Postgres, private Storage) · Claude API (next milestone) · Puppeteer for PDFs (next milestone)

## What works now

- Email and password sign-in; every page except `/login` requires it
- Create a quote (references are generated as `QUO-0001`, `QUO-0002`, ...)
- Upload screenshots to a private bucket
- Duplicate images within a quote are detected by SHA-256 and skipped
- Removing an image is a soft remove; re-uploading the same file restores it
- Database schema ready for extractions, corrections (overrides), manual items, versions and airports

Not built yet: AI extraction, the edit screen, versions and PDF generation, airport loading.

## Setup

1. Create a Supabase project. Choose the South Africa (Cape Town) region if offered.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. Authentication -> Providers -> Email: turn **off** "Allow new users to sign up". Add staff with **Invite user** (or Add user in the dashboard).
4. `cp .env.example .env.local` and fill in the project URL and keys (Project Settings -> API).
5. Install and run:

   ```bash
   npm install
   npm run dev
   ```

6. Open http://localhost:3000 and sign in.

## Layout

```
app/                      pages and server actions
  login/                  sign-in
  quotes/[id]/            quote page: image upload, image list, versions
proxy.ts                  session refresh + redirect to /login (Next 16 name for middleware)
lib/supabase/server.ts    Supabase client for server code
lib/hash.ts               SHA-256 helper used for duplicate detection
supabase/migrations/      database schema, RLS, storage bucket
```

## Design notes

- **Corrections** live in `overrides`, keyed to an item's `entity_id` and field, not to an image. They are applied on top of the AI output every time a version is assembled, so they survive revisions and image removal.
- **Extractions** are keyed to the image, so a revision only sends new images to the AI.
- **Manual items** (`manual_items`) hold flights, hotels, etc. entered by hand with no source image.
- RLS: any signed-in user is staff and can see all quotes. Tighten with `created_by` checks if needed.

## Next milestones

1. Airport table loader (replaces the monday.com Airport Ref board)
2. Extraction: classifier and per-type agents called from a background job, results into `extractions`
3. Deterministic assembler: AI data, then overrides and manual items, then pricing, into quote JSON
4. Edit screen (form and side-by-side with image)
5. Render service: port `render_lib.py` and the template, Puppeteer PDF into storage, one per version
