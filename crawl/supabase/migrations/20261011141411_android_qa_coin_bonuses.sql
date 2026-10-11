-- REVIEW ONLY. Does not credit Early Bird coins; execute the separate approved SQL.
begin;

create table public.android_qa_early_bird_eligibility (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cutoff timestamptz not null default '2026-10-11 14:14:10+00',
  registered_at timestamptz not null,
  constraint fixed_cutoff check (cutoff = timestamptz '2026-10-11 14:14:10+00'),
  constraint before_cutoff check (registered_at < cutoff)
);
alter table public.android_qa_early_bird_eligibility enable row level security;
revoke all on public.android_qa_early_bird_eligibility from public, anon, authenticated;
insert into public.android_qa_early_bird_eligibility(user_id, registered_at)
select id, created_at from auth.users
where created_at < timestamptz '2026-10-11 14:14:10+00'
  and deleted_at is null and not coalesce(is_anonymous, false);

create unique index buffacoin_once_android_qa_bonus
on public.buffacoin_ledger(user_id, reason)
where reason in ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins');

-- Guard bonus writes even on older clients with ledger_insert_own permission.
-- Runs as invoker: legitimate SECURITY DEFINER signup trigger is postgres.
create function public.guard_android_qa_coin_bonus() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reason in ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins',
                    'onboarding_seed_bonus', 'new_user_starter_coins') then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'Coin bonuses are server-authoritative' using errcode = '42501';
    end if;
    if new.reason in ('onboarding_seed_bonus', 'new_user_starter_coins') then
      return null; -- retired paths must not add to the 100-coin welcome balance
    end if;
    if new.reason = 'Welcome Bonus — 100 BuffaCoins' and new.delta is distinct from 100 then
      raise exception 'Welcome bonus must be 100';
    end if;
    if new.reason = 'Early Bird Bonus — 250 BuffaCoins' then
      if new.delta is distinct from 250 or not exists (
        select 1 from public.android_qa_early_bird_eligibility e where e.user_id = new.user_id
      ) then raise exception 'Invalid Early Bird bonus'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_android_qa_coin_bonus() from public, anon, authenticated;
create trigger guard_android_qa_coin_bonus before insert on public.buffacoin_ledger
for each row execute function public.guard_android_qa_coin_bonus();

-- Retire profile-based starter grants: profile retries must never award coins.
create or replace function public.give_new_user_starting_coins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  return new;
end;
$$;
revoke all on function public.give_new_user_starting_coins() from public, anon, authenticated;

-- Auth INSERT is the single authoritative boundary for every signup provider.
create function public.android_qa_welcome_coins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is null and not coalesce(new.is_anonymous, false) then
    insert into public.buffacoin_ledger(user_id, delta, reason)
    values (new.id, 100, 'Welcome Bonus — 100 BuffaCoins')
    on conflict (user_id, reason) where reason in
      ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins') do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.android_qa_welcome_coins() from public, anon, authenticated;
create trigger android_qa_welcome_coins after insert on auth.users
for each row execute function public.android_qa_welcome_coins();

-- Durable dismissals across logout and reinstall. No balance writes.
create table public.buffacoin_bonus_notice_ack (
  ledger_id uuid primary key references public.buffacoin_ledger(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);
alter table public.buffacoin_bonus_notice_ack enable row level security;
revoke all on public.buffacoin_bonus_notice_ack from public, anon, authenticated;
grant select, insert on public.buffacoin_bonus_notice_ack to authenticated;
create policy bonus_notice_read_own on public.buffacoin_bonus_notice_ack
for select to authenticated using (user_id = (select auth.uid()));
create policy bonus_notice_ack_own on public.buffacoin_bonus_notice_ack
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.buffacoin_ledger l where l.id = ledger_id and l.user_id = (select auth.uid())
      and l.reason in ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins')
  )
);
commit;
