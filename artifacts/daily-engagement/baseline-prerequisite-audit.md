# Strategy B Baseline Prerequisite Audit

Run date: 2026-07-23. Candidate: `b39be7580a80637f64471e1407e52a4139f069c2`.

## Finding

No versioned pre-engagement BuffaGo baseline was found in repository history,
bootstrap SQL, CI, deployment scripts, generated types, fixtures, or the two
available stashes. The linked project is `vhfxnizaxdanmvmouuaf`; the read-only
schema dump was obtained with Supabase CLI 2.107.0, PostgreSQL 17.6.1.011.

The only reconstructable artifact is a prior unversioned live schema snapshot
(`Agents/Serrano/runs/2026-07-23T204503-phase1/artifacts/phase1/live_schema_dump.sql`,
SHA-256 `BE31964E558689B153B3052A166DE7DE6B97B745DA948573230215AE7D11CE21`).
It already contains engagement tables/functions, so it is a post-engagement
replay fixture, not an authoritative pre-engagement baseline.

## Dispositions

| # | Type | Object / required signature | Dependent engagement object | Intended owner/source | Live | History | Manual | Disposition / source of truth |
|---:|---|---|---|---|---|---|---|---|
| 1 | table | `auth.users` | all user-owned objects | Supabase Auth | yes | no | managed | Supabase-managed; excluded from BuffaGo baseline |
| 2 | table | `public.users` | all engagement RPCs | BuffaGo profile foundation | yes | yes (delta references only) | likely | required external baseline; exact version missing |
| 3 | table | `public.crawls` | action/source validation | BuffaGo crawl foundation | yes | partial | likely | required external baseline |
| 4 | table | `public.routes` | crawl ownership | BuffaGo crawl foundation | yes | partial | likely | required external baseline |
| 5 | table | `public.destinations` | rating/proximity validation | BuffaGo location foundation | yes | partial | likely | required external baseline |
| 6 | table | `public.destination_ratings` | friend-rating trigger and action validation | BuffaGo ratings foundation | yes | partial | likely | required external baseline |
| 7 | table | `public.user_events` | XP/action audit | BuffaGo event foundation | yes | partial | likely | required external baseline |
| 8 | table | `public.user_wing_battle_votes` | meaningful-action validation | BuffaGo battle foundation | yes | partial | likely | required external baseline |
| 9 | table | `public.xp_ledger` | idempotent reward writes | XP migration/foundation | yes | yes | likely | required external baseline; migration history is incomplete |
| 10 | table | `public.badge_catalog` | XP/badge references | BuffaGo progression foundation | yes | partial | likely | required external baseline |
| 11 | table | `public.user_badges` | progression references | BuffaGo progression foundation | yes | partial | likely | required external baseline |
| 12 | table | `public.level_thresholds` | `xp_level_for(integer)` | BuffaGo progression foundation | yes | partial | likely | required external baseline |
| 13 | table | `public.limited_time_events` | engagement eligibility | legacy/event foundation | yes | candidate creates same-named table | likely | stale/legacy prerequisite; must be reconciled, never stubbed |
| 14 | column | `users.user_id` | user ownership | profile foundation | yes | partial | likely | external baseline |
| 15 | column | `users.xp` | reward totals | XP foundation | yes | yes | likely | external baseline |
| 16 | column | `users.share_location` | privacy eligibility | privacy/profile foundation | yes | candidate privacy delta | likely | external baseline plus reviewed delta |
| 17 | column | `users.hide_visit_date` | privacy eligibility | privacy/profile foundation | yes | candidate privacy delta | likely | external baseline plus reviewed delta |
| 18 | column | `crawls.crawl_id` | action ownership | crawl foundation | yes | partial | likely | external baseline |
| 19 | column | `crawls.route_id` | action ownership | crawl foundation | yes | partial | likely | external baseline |
| 20 | column | `crawls.user_id` | action ownership | crawl foundation | yes | partial | likely | external baseline |
| 21 | column | `routes.id` | route ownership | crawl foundation | yes | partial | likely | external baseline |
| 22 | column | `destinations.id` | source identity | location foundation | yes | partial | likely | external baseline |
| 23 | column | `destinations.lat` | proximity eligibility | location foundation | yes | partial | likely | external baseline |
| 24 | column | `destinations.lng` | proximity eligibility | location foundation | yes | partial | likely | external baseline |
| 25 | column | `destination_ratings.id` | friend notification source | ratings foundation | yes | partial | likely | external baseline |
| 26 | column | `destination_ratings.user_id` | recipient/actor ownership | ratings foundation | yes | partial | likely | external baseline |
| 27 | column | `destination_ratings.destination_id` | source identity | ratings foundation | yes | partial | likely | external baseline |
| 28 | column | `destination_ratings.crawl_id` | source identity | ratings foundation | yes | partial | likely | external baseline |
| 29 | column | `user_events.user_id` | XP audit ownership | event foundation | yes | partial | likely | external baseline |
| 30 | column | `xp_ledger.id` | reward ledger identity | XP foundation | yes | yes | likely | external baseline |
| 31 | function | `award_xp(integer,text,text,uuid,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid,jsonb)` | `claim_engagement_reward` | XP foundation | yes | yes | likely | external baseline; signature must be pinned |
| 32 | function | `xp_level_for(integer)` | reward level calculation | progression foundation | yes | partial | likely | external baseline |
| 33 | function | `can_user_appear_socially(uuid)` | notification eligibility | social/privacy foundation | yes | yes | likely | external baseline |
| 34 | function | `friend_pair_is_blocked(uuid,uuid)` | notification eligibility | friends/privacy foundation | yes | yes | likely | external baseline |
| 35 | constraint | unique `(user_id,destination_id,crawl_id)` | rating receipt identity | ratings foundation | yes | partial | likely | external baseline; required for exactly-once source identity |

The release text says “34” missing prerequisites; the SQL contains 35
distinct prerequisite rows when table, column, function, and constraint checks
are expanded. The discrepancy is itself a candidate-tooling audit finding.

## Classification

- Repository migration-history gap: profile, crawl, rating, progression, and
  social foundation objects are referenced by delta migrations but are not
  represented as a complete ordered baseline.
- Environment-specific configuration: `auth.users`, Supabase-managed roles,
  extensions, publications, and scheduler infrastructure.
- Manually created / squashed production object: live legacy progression and
  reward functions with no one-to-one repository migration.
- Stale prerequisite: `public.limited_time_events` is also created by the
  engagement-retention migration and requires an ownership decision.
- Candidate/tooling defect: reported count 34 does not match the 35 expanded
  SQL checks; the migration runner also applies every timestamped SQL file,
  not only the two migrations named by this release objective.

## Recommendation

Do not declare a passing baseline. The authoritative source must be a reviewed,
versioned BuffaGo foundation migration pack (excluding `auth` internals and
data), or a pinned external artifact with an owner, checksum, and clean-room
provisioning command. The current live snapshot is diagnostic evidence only.
