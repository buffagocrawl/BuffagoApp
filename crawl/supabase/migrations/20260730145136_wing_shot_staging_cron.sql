-- Enable the established Supabase scheduling extensions and run staging GC
-- hourly. The request is authenticated with the Vault secret configured for
-- wing-media-staging-gc.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'wing-shot-staging-gc',
  '17 * * * *',
  $job$select net.http_post(
    url := 'https://vhfxnizaxdanmvmouuaf.supabase.co/functions/v1/wing-media-staging-gc',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-wing-staging-gc-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'wing_staging_gc_secret')
    ),
    body := '{}'::jsonb
  )$job$
);
