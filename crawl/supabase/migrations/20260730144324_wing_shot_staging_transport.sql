-- Private, short-lived staging area for Wing Shot validation. The 50 MiB
-- ceiling matches the existing accepted video limit and allows the known
-- 31-35 MiB Android inputs without changing the final-submission bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wing-shot-staging', 'wing-shot-staging', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime']::text[]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Signed uploads are issued only by wing-media-stage-authorize. Keep direct
-- reads disabled; cleanup is performed through authenticated/server functions.
drop policy if exists wing_shot_staging_read on storage.objects;
drop policy if exists wing_shot_staging_delete on storage.objects;
create policy wing_shot_staging_delete on storage.objects for delete to authenticated
using (bucket_id = 'wing-shot-staging' and name like (auth.uid()::text || '/%'));

-- Supabase Cron invokes wing-media-staging-gc with WING_STAGING_GC_SECRET.
-- The secret and URL are configured in Supabase Vault; no GitHub Action is
-- part of this lifecycle.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wing-shot-staging-gc', '17 * * * *',
      $cron$select net.http_post(
        url := 'https://vhfxnizaxdanmvmouuaf.supabase.co/functions/v1/wing-media-staging-gc',
        headers := jsonb_build_object('content-type','application/json','x-wing-staging-gc-secret', (select decrypted_secret from vault.decrypted_secrets where name='wing_staging_gc_secret')),
        body := '{}'::jsonb
      )$cron$);
  end if;
exception when others then null;
end $$;
