-- Every Version is final the moment it is generated (docs/adr/0003).
-- Run in the Supabase SQL editor after 0007.
--
--   * The draft status is gone, and so is the status column: a Version is
--     never edited once it exists.
--   * Its PDF path can be filled in once, from empty, so a PDF that failed can
--     be retried from the frozen quote JSON. Every other field stays locked.
--   * A Version's items can only be written in the same transaction that
--     created the Version. After that only "chosen by client" can change.

alter table public.quote_versions
  add column created_txid bigint not null default txid_current();

drop trigger quote_versions_protect on public.quote_versions;
drop function public.protect_final_version();
alter table public.quote_versions drop column status;

create function public.protect_version() returns trigger
language plpgsql as $$
begin
  if new.assembled    is distinct from old.assembled
     or new.version_no   is distinct from old.version_no
     or new.quote_id     is distinct from old.quote_id
     or new.created_txid is distinct from old.created_txid
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path) then
    raise exception 'Versions are read-only. Generate a new version to make changes.';
  end if;
  return new;
end $$;
create trigger quote_versions_protect before update on public.quote_versions
  for each row execute function public.protect_version();

create or replace function public.protect_final_version_items() returns trigger
language plpgsql as $$
declare
  vid uuid;
  tx bigint;
begin
  if tg_op = 'DELETE' then vid := old.version_id; else vid := new.version_id; end if;
  select created_txid into tx from public.quote_versions where id = vid;
  -- Items are written together with their Version, in the same transaction.
  -- tx is null when the Version itself is being deleted (admin delete cascades).
  if tx is null or tx = txid_current() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- Recording the client's choice after the quote is sent is allowed.
  if tg_op = 'UPDATE'
     and new.version_id = old.version_id and new.entity_id = old.entity_id
     and new.kind = old.kind and new.option_no is not distinct from old.option_no then
    return new;
  end if;
  raise exception 'Versions are read-only. Generate a new version to change its items.';
end $$;
