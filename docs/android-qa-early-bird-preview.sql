-- Read-only. Eligibility: real (non-anonymous), non-deleted auth accounts.
-- Test accounts using ordinary real identities cannot be inferred from metadata.
select count(*) as eligible_accounts,
       count(*) filter (where w.user_id is null) as missing_wallets,
       coalesce(sum(w.balance), 0) as current_total_balance,
       count(*) * 250 as proposed_total_coins
from auth.users u left join public.buffacoin_wallets w on w.user_id = u.id
where u.created_at < timestamptz '2026-10-11 14:14:10+00'
  and u.deleted_at is null and not coalesce(u.is_anonymous, false);

select u.id, u.created_at, coalesce(w.balance,0) as current_balance,
       coalesce(w.balance,0) + 250 as proposed_balance
from auth.users u left join public.buffacoin_wallets w on w.user_id = u.id
where u.created_at < timestamptz '2026-10-11 14:14:10+00'
  and u.deleted_at is null and not coalesce(u.is_anonymous, false)
order by u.created_at, u.id;
