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


The exact deployment order is: Strategy B baseline preflight, the retention
migration, the privacy migration, then the daily-notifications migration.
The preflight must fail before any engagement SQL when a prerequisite is absent.
