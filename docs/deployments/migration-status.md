# Supabase Migration Status

This release candidate keeps the repository's root migrations append-only. The
deployment manifest records the exact SHA-256 checksum of every canonical root
migration in this candidate. Strategy B baseline objects are prerequisites and
are not copied into this repository. Candidate migrations are not evidence of
remote deployment; verify the remote migration ledger before applying them.

| Migration filename | Environment | Applied timestamp | Verification status | Release or commit reference | SHA-256 |
|---|---|---|---|---|---|---|
| 20260511173000_create_api_rate_limits.sql | candidate | not applied here | manifest recorded | existing repository history | e8c2ae804eff03ea0b2ccfac6a5ba3b4d8788c90958b64179ee9103e9649b8e3 |
| 20260620120000_add_facebook_connection_to_users.sql | candidate | not applied here | manifest recorded | existing repository history | c4d25ac9191686a61c61c463ad3f68302c8448f6b423990fd489f64c503c21de |
| 20260622130000_add_social_opt_out.sql | candidate | not applied here | manifest recorded | existing repository history | ed49f4a90e76d7a7a613c365ef434c48d58ab5701d55c70f43a99729108bdd9c |
| 20260622220000_add_xp_ledger.sql | candidate | not applied here | manifest recorded | existing repository history | f82f462e8c064d270b9e8f10b1f934f231bde5e9d87cf946cf3fabfbf04c8792 |
| 20260623190000_add_friends_system.sql | candidate | not applied here | manifest recorded | existing repository history | 6abb25c10b3e1317ce256f5a9f66a598f786c8b7022ba7f7bd61787388e4552c |
| 20260717123000_add_verified_growth_foundation.sql | candidate | not applied here | manifest recorded | existing repository history | 52d54901fbd609da0a9f1c105cd7b0508617b689a4d99baed232a00e9f80c7d5 |
| 20260723143000_engagement_retention.sql | candidate | not applied here | manifest recorded | 67a4567 | 0d8230c136aeebbafe1887b262b9d3edf11a4af583c4d949094c373c56d26d8e |
| 20260723144000_engagement_privacy.sql | candidate | not applied here | manifest recorded | 67a4567 | 9ee68dd94db115df65368db9fa897df26b8a338c76cfe2bbca26145faa584a09 |
| 20260724012000_daily_engagement_notifications.sql | candidate | not applied here | manifest recorded | 67a4567 | a798fd9779a6a55f4a62c8089ef575b9a7eae787bd728de2e4700384c7063f72 |
| 20260724020000_buffaverse_phase1_foundation.sql | candidate | not applied here | manifest recorded | current main | 12bb19b1a6e6c177edb55ce48922a7b53e8db86ccbdfe704fbeb8caddbad078d |
| 20260724033000_referral_system_v1.sql | candidate | not applied here | manifest recorded | current main | 0880a90853b85d47173bc97535f4bcf18ecfd5a52df7b6831d0c53d569dffc19 |
| 20260724040000_reconcile_buffaverse_phase1_foundation.sql | candidate | not applied here | manifest recorded | current main | 59c5dc1f0d1c7dc42511fdf812ae1dc27d6ed721590e850b04cacec9977d855d |
| 20260724050000_buffaverse_phase2_legendary_restaurants.sql | candidate | not applied here | manifest recorded | current main | f2452ca8c7fcb02ae161e3220739917f2cc601aa7d8cb9e05bb9a4a4a702ee0f |
| 20260724120000_current_schema_reconciliation.sql | candidate | not applied here | manifest recorded | current main | c3760e51f19e7156c9d05d636a85137b628ca018023eb3245cbde45c5810dee6 |
| 20260724133000_referral_profile_eligibility.sql | candidate | not applied here | manifest recorded | current main | 313860adf102c2868d8bb3df4cbf1f0bd6ef3ad710f7848b874a34aeb2563a43 |
| 20260724140000_buffaverse_phase2_notification_boundary.sql | candidate | not applied here | manifest recorded | current main | 0aca58df0460e41df7e7e61c6f0e5ced605288b430bb4ba9ca20e19aec11cbfb |
| 20260724141000_buffaverse_phase2_local_geography_fix.sql | candidate | not applied here | manifest recorded | current main | 9f2febb1296328ea2387740d65a78369791ab70bce3e6d9d239de6346bf04f5a |
| 20260724150000_buffaverse_phase3_restaurant_boss_battles.sql | candidate | not applied here | manifest recorded | current main | 1c25a62924c85d098cfa781600fc5814340203b318fbf2a36782729c1102b1f2 |
| 20260726100000_weekly_mission_dashboard_details.sql | candidate | not applied here | manifest recorded | current workspace | 95626c52d2f5683e98adfbf4cb2e9759aa9ec081041f2030c4b254d5a065e1ea |
| 20260726110000_challenge_leaderboard_and_profile_stats.sql | candidate | not applied here | manifest recorded | challenge leaderboard feature | 721a1d45180cdde0282e3b059d10c1ea36189ff2dfd911872ec3b78f885daadc |
| 20260726120000_challenge_leaderboard_tiebreak.sql | candidate | not applied here | manifest recorded | challenge leaderboard tie-break correction | 8b7d9b888b549c19a24d52ef6c446eb4ea6aa295a356f8f2afe1ff8e2b47f135 |


The exact deployment order is: Strategy B baseline preflight, the retention
migration, the privacy migration, then the daily-notifications migration.
The preflight must fail before any engagement SQL when a prerequisite is absent.
