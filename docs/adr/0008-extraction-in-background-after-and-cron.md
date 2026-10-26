# Extraction runs in the background: after() plus a per-minute cron, no queue service

Clicking Extract data only queues the images (`queue_extractions` marks them `pending`) and returns. The same function then reads them with Next's `after()`, using the Consultant's own session, and stops starting new images after about 520 s so it ends within the 800 s Vercel Pro limit. A Vercel Cron job (`/api/cron/extract`, every minute) reads anything still `pending`, or `running` past the 5-minute lock, using the service key. `extractions` is the queue: a row's status is the job's state, and `claim_extraction` is the atomic take. Failed images are not retried automatically; the next click queues them again.

## Considered Options

- **A queue service (Vercel Queues, Inngest, Trigger.dev)**: retries, back-off and a dashboard come built in, but it adds a service, an account and a dependency, and `extractions` already does the locking it would replace.
- **A Supabase Edge Function fed by pg_cron**: keeps the work next to the database, but the reading code (Anthropic SDK, pricing in `lib/fees.ts`) would have to run on Deno and be kept in step with the Next.js copy.
- **Cron only, no `after()`**: less code, but every click would wait up to a minute before anything happened.

## Consequences

- The cron route bypasses RLS. It accepts only Vercel's `CRON_SECRET` and only reads images a Consultant has queued.
- Each Claude call is capped at 240 s so an image is stored well inside the 5-minute lock; a longer call could be taken over by a cron run and read twice.
- Overlapping cron runs are bounded: a run starts no new image after 50 s.
- Moving to a queue service later only means replacing `readQueued`'s two callers; the statuses stay.
