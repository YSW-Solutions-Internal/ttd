-- Extraction runs in the background (docs/adr/0008).
-- Run in the Supabase SQL editor after 0016.
--
--   * queue_extractions(): the Extract button marks images 'pending'. Images never read get a
--     row; failed ones are queued again; running and done ones are left alone.
--   * claim_extraction() no longer takes 'failed' images: a failure waits for the button, so
--     the per-minute cron never sends a bad image to Claude over and over.
--   * The cron reads with the service key, which needs store_extraction too.

create or replace function public.queue_extractions(p_image_ids uuid[], p_prompt_version text)
returns setof uuid
language sql as $$
  insert into public.extractions as e (image_id, prompt_version, status)
  select unnest(p_image_ids), p_prompt_version, 'pending'
  on conflict (image_id) do update
    set status = 'pending', error = null
    where e.status = 'failed'
  returning image_id
$$;
-- Runs as the caller, so RLS on extractions still limits it to the caller's images.
revoke execute on function public.queue_extractions(uuid[], text) from public, anon;
grant execute on function public.queue_extractions(uuid[], text) to authenticated;

create or replace function public.claim_extraction(p_image_id uuid, p_prompt_version text, p_model text)
returns boolean
language sql as $$
  update public.extractions as e
     set status = 'running', error = null, prompt_version = p_prompt_version,
         model = p_model, started_at = now()
   where e.image_id = p_image_id
     and (e.status = 'pending'
          or (e.status = 'running' and (e.started_at is null or e.started_at < now() - interval '5 minutes')))
  returning true
$$;

grant execute on function public.store_extraction(uuid, text, jsonb) to service_role;
