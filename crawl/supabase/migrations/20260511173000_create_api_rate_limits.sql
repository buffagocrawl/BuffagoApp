create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  ip_address text null,
  feature text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_rate_limits_feature_idx on public.api_rate_limits (feature);
create index if not exists api_rate_limits_user_id_idx on public.api_rate_limits (user_id);
create index if not exists api_rate_limits_ip_address_idx on public.api_rate_limits (ip_address);
create index if not exists api_rate_limits_created_at_idx on public.api_rate_limits (created_at);

alter table public.api_rate_limits enable row level security;

-- No public policies are defined on purpose. Supabase clients cannot read or
-- write this table; Edge Functions use the service role key and bypass RLS.
