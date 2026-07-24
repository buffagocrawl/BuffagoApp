# Final Approval Packet

Status: **Not approved. Human approval required.**

Release candidate source is base commit `0cdfc7fef4e98b04d83b658cc691b7fc2e226b5b` plus the uncommitted, narrowly scoped closure changes in this worktree. There is no standalone release commit because the worktree contains pre-existing user changes; production must use a reviewed commit containing the complete intended diff.

Database: Strategy B, external BuffaGo baseline; `public.users` is the profile table and `auth.users` is authoritative identity. Run `crawl/scripts/apply-engagement-migrations.ps1 -DatabaseUrl <url>`; it preflights and then applies the ordered SQL files in `crawl/supabase/migrations`, excluding `deployed-archive.sql`.

Platform: web supported. Native maps are behind `platformMap.native.js`; web uses the explicit map/geofence limitation fallback. Web export passed.

Evidence: TypeScript passed; lint passed with 0 errors and 95 warnings; Android, iOS, and web exports passed after the platform boundary; prior local baseline, partial-state, RLS/RPC, concurrent XP, and outbox-deduplication evidence remains in `test-results.md` and `release-validation.log`.

Physical iOS/Android push, deep-link, provider, and real-world proximity evidence is absent because no devices/toolchain are available. All risky engagement and background-geofencing flags remain off.

After approval, enable notification settings internally, then daily engagement UI, then 5%/25%/50%/100% stages with at least 24 hours per stage. Push categories and background geofencing follow separately. Rollback disables flags, stops the dispatcher, cancels queued rows without deleting audit history, and stops registered geofences on client sync. Do not drop data migrations during rollback.

User-visible change: eligible meaningful activity can show daily missions, streak reminders, friend-rating and crawl-proximity notifications when enabled; web shows a clear mobile-only limitation for maps/proximity. No daily-open reward is added.

## Current approval packet delta — 2026-07-24

- Final SHA and ordered commit range: pending final validation commit; branch `workstream/daily-engagement-current-schema` starts from `561caca49474390b69e3734d0bad43b02861a727`.
- Contract: Current Supported Schema Contract v1, SHA-256 `fe2af053e41c78ed27919292d4168a87d990a3f4637ca5dcb30703bac0a1d891`.
- Risk acceptance recorded; no database-foundation gate pass claimed.
- `limited_time_events`: preserve compatible definition, compatibility-create only when absent in supported non-production, fail closed when incompatible.
- Preflight/reconciliation static checks passed; live target results pending.
- Notifications and dispatcher package present; provider/device tests pending, iOS blocked, Android not run.
- Exact approval requested: approve staging deployment/non-production validation only; production remains withheld until live preflight, reconciliation, panel, provider, and device evidence pass.
## Immutable candidate metadata

- Candidate code commit: 7937e76c6e9bab3f28c9e3d2479e029c458ee7fa
- Branch: main
- Node: v22.20.0
- Expo: ~54.0.35
- React: 19.1.0
- React Native: 0.81.5
- Supabase CLI: 2.107.0
- package-lock.json SHA-256: 57ED28126B825274E772EA968496FC52E24662262BAB1ACC32ACE8447CA706CE
- Migration SHA-256:
- 20260511173000_create_api_rate_limits.sql: E8C2AE804EFF03EA0B2CCFAC6A5BA3B4D8788C90958B64179EE9103E9649B8E3 - 20260620120000_add_facebook_connection_to_users.sql: C4D25AC9191686A61C61C463AD3F68302C8448F6B423990FD489F64C503C21DE - 20260622130000_add_social_opt_out.sql: C8ADAF16ED1B9A18252ACC1CB126E1F016A4B86368A78D645E74C1851B6A7732 - 20260622220000_add_xp_ledger.sql: F82F462E8C064D270B9E8F10B1F934F231BDE5E9D87CF946CF3FABFBF04C8792 - 20260623190000_add_friends_system.sql: 6ABB25C10B3E1317CE256F5A9F66A598F786C8B7022BA7F7BD61787388E4552C - 20260717123000_add_verified_growth_foundation.sql: 52D54901FBD609DA0A9F1C105CD7B0508617B689A4D99BAED232A00E9F80C7D5 - 20260723143000_engagement_retention.sql: EBC224EF6A2EC2D3EB2D3169B1FF62B6C0D493BF5F2A61E3FB63657F83A357B7 - 20260723144000_engagement_privacy.sql: 788D0CBDCEE665A5E25A0A924EAFAD8F590CE303426C7C406253B6A029EB3EB8 - 20260723150000_social_feed_reactions.sql: B3E990EE236F0FAA817031A56FE3354CF72BC4EFB5C3A04201CCD552E50A07DA - 20260723151000_social_feed_v2.sql: 210AE0C75C8BBB8FA9442F71B9CEDC854E706606FE48AE18E4C654657FF0BC4C - 20260723203000_wing_passport_rewards.sql: B9D808E3E90B2A704363606DC30A231558BF424231F64E3AF8FE9DAB5ED2FD96 - 20260724012000_daily_engagement_notifications.sql: 6ACA84FC7F495276758519658171F50B7D15BC4656AF4D3B9A4AFCB34D2C0C8D - 20260724020000_buffaverse_phase1_foundation.sql: B497B7F0102D494E8A29CE2F08B28F489DC0751D1594552D09D1AEBE96F5FDE3 - 20260724033000_referral_system_v1.sql: 25BDC8A91CBE3F5F23B575C766357BEA0DB87D81219C4C073D97581E7E2AE0CD
- Candidate commit was created before physical validation. The main worktree still contains unrelated pre-existing changes outside this candidate; the candidate itself is validated from its commit contents.
## Reconstruction boundary

Final candidate: `b39be7580a80637f64471e1407e52a4139f069c2` from base `0cdfc7f`.

The candidate is clean in an isolated worktree. TypeScript, 68/68 JavaScript tests, 41/41 focused daily-engagement tests, all three exports, lint (0 errors), and migration-integrity passed. Strategy B preflight correctly stopped on the available database because the required baseline was not provisioned; no database runtime pass is claimed. Physical-device and provider validation remain blocked. Latest valid panel score remains 93.125. Production approval remains withheld.

## Database recovery update — 2026-07-23

One disposable local Supabase replay passed preflight, both target migrations,
replay, and the existing schema/RLS/RPC/outbox checks. The recovered snapshot
was already post-engagement and is not an authoritative baseline. A second clean
environment and the full executable runtime matrix were not proven. No
production mutation occurred and no candidate commit was created.
