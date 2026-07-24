# Buffago Refer a Friend v1 — local implementation report

## 1. Current-state audit

The pre-edit audit is preserved at
`Agents/Serrano/commissioned/referral-system-v1/current_state_audit.md`. Existing friend
UUID/QR invitations are friend-request infrastructure, not acquisition referrals.
There was no verified attribution, settlement, or badge-progress domain. `xp_ledger`
was suitable after adding a referral FK contract and deterministic role keys.

## 2. Architecture and data flow

See `Agents/Serrano/commissioned/referral-system-v1/architecture.md`. The decisive
boundary is `submit_validated_crawl_rating`: it validates and writes the rating, locks
the attribution, settles both ledgers, updates badges, and queues notifications in one
transaction.

## 3. Proposed database migration

`crawl/supabase/migrations/20260724033000_referral_system_v1.sql` adds:

- centralized default-off reward configuration;
- stable case-insensitive codes and collision-safe provisioning/backfill;
- attribution, rewards, abuse signals, in-app notifications;
- canonical rating/settlement, claim, Hub, code validation, onboarding, reversal, and
  reconciliation RPCs;
- reporting views and verified 1/5/10 badges;
- guarded integration with the existing push outbox;
- a NOT VALID `xp_ledger.referral_id` FK pending historical staging inspection.

No migration was applied or deployed by this implementation.

## 4. RLS summary

Raw lifecycle, reward, configuration, abuse, and review data is revoked from clients.
Authenticated users may read only their code and own in-app notifications. Hub and
claim data flow through privacy-safe security-definer RPCs. Anonymous access is limited
to public configuration, code validation, and deduplicated click capture. Reconciliation,
reporting, and reversal are service-role only.

## 5. Qualification rules

- Invitee is a new account within the configured seven-day claim window.
- One inviter per invitee; no self-referral or pre-claim rating activity.
- Onboarding must be recorded complete.
- Qualifying action is the invitee's first complete, non-Buffacoin crawl rating.
- Crawl ownership, route membership/order, scores, coordinates, and destination are
  validated server-side.
- Public guidance is 100 yards. The hidden server operational tolerance is 0.5 mile.
- Outside 0.5 mile fails and rolls back; referral logic never applies a second check.

## 6. Reward and ledger design

Each party receives the configured 250 XP after qualification. Primary keys are
`referral:<attribution>:<role>:qualification`. Database uniqueness protects recipient
role, reward type, ledger entry, rating, invitee, and idempotency key. Milestone XP is
disabled; badges are recognition only. Trusted reversal writes compensating negative
ledger entries and preserves originals.

## 7. Anti-abuse controls

Self/existing-account checks, first-rating proof, account availability checks, row
locking, unique constraints, remote-rating exclusion, hashed existing anonymous ID,
installation reuse, rapid qualification, inviter velocity, deletion, reversal, and
ledger inconsistency signals are included. Signals flag review rather than silently
banning users.

## 8. UI

`app/referrals.jsx` provides loading/error/retry/empty states, stable metrics, code,
copy, native sharing, mutual reward copy, verified/pending/joined counts, total rewards,
next badge progress, privacy-safe recent statuses, and manual claim. Entry points are
profile/account and the Friends empty state. The implementation uses existing Paper
components and contains no required motion.

## 9. Deep links and authentication

`ReferralAttributionBridge` handles cold/warm links, stores the minimal pending intent,
claims at auth transition, and repairs the claim/onboarding race. `/r/[code]` provides
a non-blocking confirmation route. `app.config.js` supports the custom scheme and adds
HTTPS association configuration only when a referral domain is supplied.

## 10. Notifications

Friend joined, inviter qualified, invitee qualified, and badge events create unique
in-app rows. Push rows are queued only when `friend_activity` is opted in. The existing
dispatcher reads referral copy from `copy_data`; referral deep links resolve to the Hub.

## 11. Analytics catalog

Hub view, prompt click, share started/completed, code copied/entered, link opened, claim
success/failure, referred signup, qualification, reward issued/failed, and badge
unlocked are cataloged. Sanitization excludes contact, secret, nested, and raw error
data. Server events carry attribution correlation without personal profile data.

## 12. Tests and static results

- Referral: 19/19 pass.
- Existing auth: 14/14 pass.
- Existing analytics: 5/5 pass.
- Full database/RLS suite: 41/41 pass, including 11 referral database contracts.
- Existing quick-rating script: pass.
- TypeScript: pass.
- Expo public config generation: pass.
- ESLint: 0 errors; 95 pre-existing warnings across the dirty worktree.
- `git diff --check`: pass.
- Local database lint exposed three referral compatibility issues which were corrected
  in the proposal. It also reported unrelated existing errors in `coin_rate_destination`,
  `earn_badge`, and `wallet_add_coins`; staging must resolve/confirm them independently.

Repository contract tests do not substitute for executing the proposed SQL in staging.

## 13. Reconciliation

Service role runs `reconcile_referrals(true)` first. It reports qualified totals,
missing reward sets, ledger mismatches, duplicates, invalid transitions, and badge
mismatches. Reviewed apply mode synchronizes verified badges and flags ledger problems;
it does not fabricate missing monetary records.

## 14–15. Panel and iteration

See `docs/referrals/review-panel.md`: average 95.63, minimum 95, three documented loops,
and no unresolved local critical issue.

## 16. Referral-modified files

New referral-specific files:

- app routes: `app/referrals.jsx`, `app/r/[code].jsx`
- domain: `lib/referrals.js`, `lib/referralModel.js`, `config/referrals.js`
- bridge: `components/ReferralAttributionBridge.jsx`
- migration and tests under `supabase/migrations` and `tests/referrals`
- database contract test and `docs/referrals/*`
- Serrano specification and commissioned referral plan pack

Narrow integration edits:

- `app.config.js`, `app/_layout.tsx`, `app/crawl/[id].jsx`, `app/user/index.jsx`
- `components/FriendsPanel.jsx`, `lib/analyticsSchema.js`
- `lib/notifications/deepLinks.js`
- `supabase/functions/notification-dispatch/index.ts`
- `package.json`

Unrelated changes in those already-dirty files were preserved.

## 17. Required configuration

- `EXPO_PUBLIC_ENABLE_REFERRALS=true` only after staging acceptance.
- `EXPO_PUBLIC_REFERRAL_BASE_URL=https://<approved-domain>`.
- `EXPO_PUBLIC_REFERRAL_DOMAIN=<approved-domain>`.
- HTTPS domain association files for iOS and Android.
- Database `referral_reward_config.is_enabled=true` only in reviewed staging/production
  rollout.
- Existing notification dispatcher secret/schedule and referral-compatible migration
  ordering.

## 18. Manual verification

Follow `docs/referrals/staging-verification-checklist.md`, including the commissioned
18-step two-account scenario, three distance bands, retry/network-timeout behavior,
role matrix, ledgers, badges, notifications, analytics, and unrelated-user denial.

## 19. Known limitations

- True click-through-app-store deferred linking needs the configured web handoff and
  association files; manual code remains the fallback.
- Proposed SQL has not been executed against staging by design.
- Device-level OAuth/deep-link interruption and maximum Dynamic Type require physical
  device verification.
- Existing unrelated database lint errors may block a clean staging migration chain.
- Reversal for a fully deleted user may require a forward admin migration if the
  existing public user/ledger deletion semantics remove the cached balance row.

## 20. Post-launch metrics and alerts

- Alert if duplicate reward/ledger consistency checks are nonzero: immediate/critical.
- Alert if rating accepted but settlement failed: any occurrence.
- Alert if signup-to-qualification falls below 25% after 100 attributed signups.
- Review if installation reuse exceeds 3% or rejected/flagged referrals exceed 5%.
- Review inviter velocity at five qualifications/hour.
- Review median signup-to-qualification above seven days.
- Review reward cost per retained referred rater weekly; pause if it exceeds the
  approved acquisition-cost ceiling.
- Watch referral notification failure above 2% and deep-link fallback above 5%.
