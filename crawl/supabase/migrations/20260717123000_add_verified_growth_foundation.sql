-- Additive foundation for missions, reviewed restaurant claims, and transparent promotions.
create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_key text not null check (mission_key ~ '^[a-z0-9_]+$'),
  period_start date not null,
  expires_at timestamptz not null,
  target integer not null check (target > 0),
  progress integer not null default 0 check (progress >= 0),
  reward_xp integer not null default 0 check (reward_xp between 0 and 500),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, mission_key, period_start)
);

create table if not exists public.mission_reward_receipts (
  id uuid primary key default gen_random_uuid(),
  mission_assignment_id uuid not null references public.mission_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp_ledger_id uuid references public.xp_ledger(id),
  created_at timestamptz not null default now(),
  unique (mission_assignment_id)
);

create table if not exists public.restaurant_claims (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  business_role text not null check (business_role in ('owner', 'manager', 'authorized_representative')),
  verification_note text not null check (char_length(verification_note) between 10 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_information')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists restaurant_claims_one_open_claim
  on public.restaurant_claims(destination_id, claimant_user_id)
  where status in ('pending', 'needs_information', 'approved');

create table if not exists public.restaurant_promotions (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  promotion_kind text not null check (promotion_kind in ('pilot_request', 'featured_offer')),
  label text not null default 'Sponsored',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'active', 'paused', 'ended', 'rejected')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (label in ('Sponsored', 'Owner promotion'))
);

alter table public.mission_assignments enable row level security;
alter table public.mission_reward_receipts enable row level security;
alter table public.restaurant_claims enable row level security;
alter table public.restaurant_promotions enable row level security;

revoke all on public.mission_reward_receipts from anon, authenticated;
revoke update, delete on public.restaurant_claims from authenticated;
revoke all on public.restaurant_promotions from anon, authenticated;
grant select on public.mission_assignments to authenticated;
grant select on public.mission_reward_receipts to authenticated;
grant select, insert on public.restaurant_claims to authenticated;
grant select on public.restaurant_promotions to authenticated;

create policy mission_assignments_select_own on public.mission_assignments
  for select to authenticated using (user_id = auth.uid());
create policy mission_receipts_select_own on public.mission_reward_receipts
  for select to authenticated using (user_id = auth.uid());
create policy restaurant_claims_select_own on public.restaurant_claims
  for select to authenticated using (claimant_user_id = auth.uid());
create policy restaurant_claims_insert_own on public.restaurant_claims
  for insert to authenticated with check (
    claimant_user_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null
  );
create policy promotions_owner_select on public.restaurant_promotions
  for select to authenticated using (
    owner_user_id = auth.uid() and exists (
      select 1 from public.restaurant_claims rc
      where rc.destination_id = restaurant_promotions.destination_id
        and rc.claimant_user_id = auth.uid() and rc.status = 'approved'
    )
  );

create or replace function public.owner_restaurant_metrics(p_destination_id uuid)
returns table(rating_count bigint, average_wing_score numeric)
language sql stable security definer set search_path = public
as $$
  select count(dr.*), round(avg(dr.overall)::numeric, 1)
  from public.destination_ratings dr
  where dr.destination_id = p_destination_id
    and exists (
      select 1 from public.restaurant_claims rc
      where rc.destination_id = p_destination_id
        and rc.claimant_user_id = auth.uid() and rc.status = 'approved'
    );
$$;
revoke all on function public.owner_restaurant_metrics(uuid) from public, anon;
grant execute on function public.owner_restaurant_metrics(uuid) to authenticated;

comment on table public.restaurant_promotions is
  'Transparent promotion records. Organic destination ranking data is never updated by this model.';
