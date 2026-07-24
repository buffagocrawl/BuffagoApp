# Supabase Migration Status

This release candidate keeps the repository's nine root migrations append-only.
The deployment manifest records the exact SHA-256 checksum of each migration in
this candidate. Strategy B baseline objects are prerequisites and are not copied
into this repository.

| Migration filename | Environment | Applied timestamp | Verification status | Release or commit reference | SHA-256 |
|---|---|---|---|---|---|---|
| 20260511173000_create_api_rate_limits.sql | candidate | not applied here | manifest recorded | existing repository history | 41cd119c53b9332f36f1f76ae7a5be1bfa714b0284fe55876b2664a521a35ae6 |
| 20260620120000_add_facebook_connection_to_users.sql | candidate | not applied here | manifest recorded | existing repository history | b79b77811f2047df7d034d8a349a7323c06e433960cfcd3fbb5efdda7ddbe506 |
| 20260622130000_add_social_opt_out.sql | candidate | not applied here | manifest recorded | existing repository history | ed49f4a90e76d7a7a613c365ef434c48d58ab5701d55c70f43a99729108bdd9c |
| 20260622220000_add_xp_ledger.sql | candidate | not applied here | manifest recorded | existing repository history | a50b0215f355789f90d05744e4531853a20c7ad183b39b772b1ee9fab8fae7f2 |
| 20260623190000_add_friends_system.sql | candidate | not applied here | manifest recorded | existing repository history | 702a6860dc2dcda02f4742d075d44411d7b679b130d744b0d24a5137ab34b24f |
| 20260717123000_add_verified_growth_foundation.sql | candidate | not applied here | manifest recorded | existing repository history | 343d0c9df694b7b526c10daa4d5078621bd061d60ab6c261adef6c49add95396 |
| 20260723143000_engagement_retention.sql | candidate | not applied here | manifest recorded | 67a4567 | 0d8230c136aeebbafe1887b262b9d3edf11a4af583c4d949094c373c56d26d8e |
| 20260723144000_engagement_privacy.sql | candidate | not applied here | manifest recorded | 67a4567 | 9ee68dd94db115df65368db9fa897df26b8a338c76cfe2bbca26145faa584a09 |
| 20260724012000_daily_engagement_notifications.sql | candidate | not applied here | manifest recorded | 67a4567 | a798fd9779a6a55f4a62c8089ef575b9a7eae787bd728de2e4700384c7063f72 |
| 20260724020000_buffaverse_phase1_foundation.sql | production | deployed 2026-07-24 | exact historical bytes recovered; remote ledger exactly once | Phase 1 recovery blob | b497b7f0102d494e8a29ce2f08b28f489dc0751d1594552d09d1aebe96f5fde3 |
| 20260724040000_reconcile_buffaverse_phase1_foundation.sql | production | deployed 2026-07-24 | exact historical bytes recovered; remote ledger exactly once | Phase 1 recovery blob | b974992cf77e4b045c441629e2328ecc5affd0de3dce1cbeff446cd81964269c |
| 20260724050000_buffaverse_phase2_legendary_restaurants.sql | production | deployed 2026-07-24 | exact historical bytes recovered from Git object `755610e86e765810e6f955bbfcd4c434c8a069dd`; remote ledger exactly once | Phase 2 reconciliation recovery; immutable canonical root | 56bbd4577a4b9a09cc180d27259d79c7f75a85487c1d35670c56e0898dca205e |
| 20260724120000_current_schema_reconciliation.sql | known pending / concurrent owner | ledger status unresolved | explicitly registered; do not edit or deploy from this worktree | daily-engagement/current-schema workstream | c3760e51f19e7156c9d05d636a85137b628ca018023eb3245cbde45c5810dee6 |
| 20260724140000_buffaverse_phase2_notification_boundary.sql | production | deployed 2026-07-24 | disposable PostgreSQL 18 execution passed; targeted dry run selected only this migration; remote ledger exactly once; live API identity verified | Buffaverse Phase 2 approval reconciliation | e684826d7bbe72f8ffc1b78bca4fba2dc3850ef71c8b5b438f28e12fe9296124 |
| 20260724141000_buffaverse_phase2_local_geography_fix.sql | production | deployed 2026-07-24 | disposable PostgreSQL 18 execution, local-scope creation, creator concurrency, and completion idempotency passed; targeted dry run selected only this migration; remote ledger exactly once; live API exposes the corrected creator | Buffaverse Phase 2 approval reconciliation | 19b7fdf4155c8aa7d4c3e6498d7822ba68c832dbf4ca68b25283ddb6ef77d6c5 |

The exact deployment order is: Strategy B baseline preflight, the retention
migration, the privacy migration, then the daily-notifications migration.
The preflight must fail before any engagement SQL when a prerequisite is absent.
