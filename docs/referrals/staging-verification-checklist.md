# Referral-system-v1 staging verification

Production is blocked until this checklist passes against staging/live-schema
introspection. The proposed migration must not be applied to production as part of this
handoff.

## Automated schema inspection

1. Apply prior repository migrations and
   `20260724033000_referral_system_v1.sql` to a disposable or staging Supabase project.
2. Run `psql "$STAGING_READ_ONLY_URL" -f docs/referrals/staging-verification.sql`.
3. Resolve every missing relation/column, false RLS result, unexpected grant, invalid
   function privilege, unvalidated foreign key, or duplicate row.
4. Confirm `xp_ledger.referral_id` contains no historical non-referral UUIDs, then
   validate `xp_ledger_referral_id_fkey` in a separately reviewed staging migration.

## Seeded role matrix

Use four test identities: inviter A, new invitee B, unrelated C, and service role.

- Anonymous can validate/record a code click but cannot enumerate codes, attributions,
  rewards, abuse signals, notifications, or configuration rows.
- A can read only A's code, privacy-safe Hub RPC result, own XP ledger, and own in-app
  notifications. A cannot mutate referral lifecycle tables.
- B can claim exactly one inviter, mark B's onboarding complete, submit the canonical
  rating RPC, read B's XP ledger, and read B's in-app notifications.
- C cannot read A/B attribution, reward, install hash, rejection detail, review metadata,
  or notifications.
- Only service role can run reconciliation, reversal, reporting, and full review.

## Canonical rating boundary

For B, use the same crawl/destination/scores with controlled coordinates:

- Inside 100 yards: rating accepted; first eligible referral settles once.
- Between 100 yards and 0.5 mile: rating accepted because the operational GPS tolerance
  is intentional; no UI or returned payload reveals that tolerance.
- Outside 0.5 mile: RPC returns `rating_proximity_failed`; verify no rating, reward,
  badge, outbox, or qualification row commits.
- Invalid scores, another user's crawl, and a destination outside the crawl fail.
- Repeat the accepted request and simulate a network timeout/retry. Verify one rating
  identity, one inviter reward, one invitee reward, and one ledger idempotency key per
  role.
- Direct client insertion into `destination_ratings` must not qualify a referral.

## XP ledger and economy

- Inviter and invitee each receive the configured 250 XP once.
- `users.xp` equals the ledger-derived balance after settlement.
- Each `referral_rewards.ledger_entry_id` exists and matches recipient, amount,
  attribution, source, role metadata, and idempotency key.
- Referral badges grant no additional milestone XP while
  `milestone_bonus_enabled=false`.
- Exercise trusted reversal in staging; verify compensating negative ledger rows,
  preserved original rows, `reversed` status, and retry idempotency.
- Run `reconcile_referrals(true)` first. Only after reviewing its output, exercise
  service-role `reconcile_referrals(false)` in staging; it synchronizes verified badge
  state and flags reward/ledger inconsistencies for manual repair without fabricating
  missing rewards.

## Badges

- Only `rewarded`/verified referral attributions count.
- Verify badge transitions exactly at 1, 5, and 10.
- Clicks, pending signups, self-referrals, rejected/reversed abuse rows, and manipulated
  client counters do not advance progress.
- Existing badge codes/names in staging are reviewed for conflicts before migration.

## Notifications

- With `friend_activity=false`, only the safe in-app fallback is created.
- With `friend_activity=true` and a valid installation, friend joined, inviter
  qualified, invitee qualified, and badge events are queued once.
- Dispatcher produces referral-specific title/body and deep-links to `/referrals`.
- Reprocessing the outbox does not duplicate notification rows or sends.
- Quiet hours, invalid tokens, retries, permanent failure, and delivery-attempt logging
  behave as the existing notification foundation specifies.

## Account deletion and abuse

- New rewards cannot settle if inviter or invitee no longer exists in `auth.users`.
- Deleting a test account does not erase or block preservation of attribution/reward
  audit rows; user-facing notification rows may cascade.
- Reused installation, fast qualification, inviter velocity, deletion, and fraudulent
  rating reversal create review signals without silently banning an account.

## End-to-end acceptance

Complete the 18-step scenario in the product commission using two clean test accounts.
Capture attribution ID/correlation ID, rating ID, both ledger IDs, outbox IDs, badge ID,
analytics rows, screenshots, and retry results. Production approval remains blocked
until the evidence is attached to the release candidate.
