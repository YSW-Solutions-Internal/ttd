-- An invoice's PDF goes when the invoice does.
-- Run in the Supabase SQL editor after 0025.
--
--   * Whoever may add invoices to a Trip (can_add_invoice, 0024) may delete a file in
--     invoice-files under that Trip, but only once no invoice points at it: after the
--     invoice is deleted, or when adding it failed after the upload. A file still in use
--     cannot be deleted through the API by anyone.

create policy invoice_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoice-files'
         and public.can_access_file(bucket_id, name)
         and not exists (select 1 from public.invoices i where i.file_path = storage.objects.name));
