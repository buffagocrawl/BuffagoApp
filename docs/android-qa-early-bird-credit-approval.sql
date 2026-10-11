-- PRODUCTION WRITE: DO NOT EXECUTE WITHOUT EXPLICIT OWNER APPROVAL.
-- Prerequisite: reviewed android_qa_coin_bonuses migration.
begin;
with awarded as (
  insert into public.buffacoin_ledger(user_id, delta, reason)
  select user_id, 250, 'Early Bird Bonus — 250 BuffaCoins'
  from public.android_qa_early_bird_eligibility
  on conflict (user_id, reason) where reason in
    ('Welcome Bonus — 100 BuffaCoins', 'Early Bird Bonus — 250 BuffaCoins') do nothing
  returning user_id, delta
)
select count(*) as newly_awarded_accounts, coalesce(sum(delta),0) as newly_awarded_coins
from awarded;

-- Ledger trigger initializes missing wallets at zero then adds delta atomically.
select count(*) as credited_accounts, coalesce(sum(l.delta),0) as credited_total,
       count(*) filter (where l.delta <> 250 or w.user_id is null) as invalid_awards
from public.android_qa_early_bird_eligibility e
join public.buffacoin_ledger l on l.user_id=e.user_id and l.reason='Early Bird Bonus — 250 BuffaCoins'
left join public.buffacoin_wallets w on w.user_id=e.user_id;
do $$
begin
  if exists (
    select 1 from public.android_qa_early_bird_eligibility e
    left join public.buffacoin_ledger l on l.user_id=e.user_id
      and l.reason='Early Bird Bonus — 250 BuffaCoins'
    left join public.buffacoin_wallets w on w.user_id=e.user_id
    where l.id is null or l.delta <> 250 or w.user_id is null
  ) then raise exception 'Early Bird verification failed; rolling back'; end if;
end;
$$;
commit;
