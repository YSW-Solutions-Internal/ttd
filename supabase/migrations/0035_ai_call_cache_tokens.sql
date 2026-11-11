-- The AI log's cost estimate (README milestone 17): input_tokens leaves out the cached
-- extraction prompt, so each call also records what it wrote to and read from the cache.
-- Run in the Supabase SQL editor after 0034. Older rows stay empty and their cost shows as an under-estimate.

alter table public.ai_calls
  add column cache_write_tokens int,
  add column cache_read_tokens  int;
