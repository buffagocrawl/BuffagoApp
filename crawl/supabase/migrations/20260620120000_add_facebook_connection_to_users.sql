alter table public.users
  add column if not exists facebook_connected boolean not null default false,
  add column if not exists facebook_provider_id text,
  add column if not exists facebook_connected_at timestamptz;

create unique index if not exists users_facebook_provider_id_unique
  on public.users (facebook_provider_id)
  where facebook_provider_id is not null;

comment on column public.users.facebook_connected is
  'True when the current Supabase Auth user has linked a Facebook identity to this BuffaGo account.';

comment on column public.users.facebook_provider_id is
  'Facebook provider user id from Supabase identity metadata. No Facebook OAuth tokens are stored.';

comment on column public.users.facebook_connected_at is
  'Timestamp when BuffaGo first persisted the Facebook link.';
