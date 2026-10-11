# Buffago — Supabase migration ledger evidence

**Observed:** 2026-10-09, read-only via connected Supabase.
**Project ref:** `vhfxnizaxdanmvmouuaf` (verified against Buffago tables, not yet cross-checked with the local repo project ref).
**Source:** `supabase_migrations.schema_migrations`.
**Database writes:** none.

## Summary

- 35 migration records.
- Each record has at least one stored SQL statement.
- Earliest: `20260625000100`; latest: `20261009201342`.
- Ledger versions absent: `20260729122000`, `20260729126000`, `20260729132000`, `20260729200000`, `20261008232910`.
- Absence from the ledger does not prove SQL was never manually executed.
- The hashes below are **MD5 of the first stored statement text**, NOT necessarily hashes of the original migration files.

## Full ordered remote ledger metadata

| Version | Name | Statement count |
|---|---|---:|
| `20260625000100` | `jalapeno_phase2_foundation` | 46 |
| `20260627000100` | `jalapeno_content_engine` | 27 |
| `20260627000200` | `jalapeno_image_assets` | 13 |
| `20260627000300` | `create_jalapeno_assets_bucket` | 3 |
| `20260724020000` | `buffaverse_phase1_foundation` | 48 |
| `20260724040000` | `reconcile_buffaverse_phase1_foundation` | 12 |
| `20260724050000` | `buffaverse_phase2_legendary_restaurants` | 45 |
| `20260724140000` | `buffaverse_phase2_notification_boundary` | 15 |
| `20260724141000` | `buffaverse_phase2_local_geography_fix` | 7 |
| `20260729140000` | `wing_shots_unrestricted_sources` | 19 |
| `20260729150000` | `reconcile_wing_upload_rpc` | 8 |
| `20260729160000` | `wing_shot_rating_rule` | 16 |
| `20260730120000` | `wing_shot_uploaded_object_validation` | 9 |
| `20260730145055` | `wing_shot_staging_transport` | 1 |
| `20260730222132` | `wing_shot_finalize_legacy_compat` | 5 |
| `20260731010318` | `20260731005535_wing_finalize_service_role_promotion_contract` | 1 |
| `20260731012137` | `20260731010940_wing_finalize_processing_job_idempotency_recovery` | 1 |
| `20260731013505` | `20260731013034_wing_review_only_finalization` | 1 |
| `20260802143027` | `wing_shots_photo_only_upload_enforcement` | 1 |
| `20261006235107` | `add_buffago_growth_snapshot_v1` | 1 |
| `20261007000241` | `image_workflow_rc_regression` | 1 |
| `20261007001523` | `add_buffago_growth_display_device_auth` | 1 |
| `20261007002518` | `extend_buffago_growth_snapshot_with_history` | 1 |
| `20261007003617` | `add_buffago_growth_os_state` | 1 |
| `20261007120615` | `add_buffago_growth_admin_control_plane` | 1 |
| `20261007121117` | `add_mau_north_star_to_growth_os` | 1 |
| `20261007125712` | `add_growth_controller_device_identity` | 1 |
| `20261007233721` | `rotate_growth_pi_tokens_20261007` | 1 |
| `20261008121036` | `product_pulse_operations` | 1 |
| `20261008133555` | `growth_command_center_redesign` | 1 |
| `20261008144550` | `photo_votes_and_title_card_ranking` | 1 |
| `20261008171259` | `growth_wall_activity_weekly_catalog` | 1 |
| `20261008171906` | `wing_photo_derivative_recovery` | 1 |
| `20261008184025` | `wing_photo_receipt_fixed_search_path` | 1 |
| `20261009201342` | `wing_photo_vote_gallery_eligibility` | 1 |

## Stored SQL fingerprints (selected versions)

| Version | Stored statement characters | MD5 of stored statement |
|---|---:|---|
| `20261007000241` | 27556 | `629d2f0809661b0d2886f6e58c939f90` |
| `20261008144550` | 6005 | `9237cb7e3c4fda5709a29a12839aedd5` |
| `20261009201342` | 4254 | `009dd8fbf37a2198e666e1aa06427a65` |

## Known repository-side blockers (reported by Codex; not independently checked against local files)

- 69 root migration files, duplicate `20260729200000`, five real manifest checksums, 17 unmanifested migrations.
- `migration:integrity` failure and two related test failures remain.
- Focused photo/security PGlite tests previously passed.

## Interpretation and limitations

This is an inventory of migration ledger records and selected stored-statement fingerprints. It does **not** verify production state against every historical local migration, nor authorize replay of unrecorded SQL, nor establish whether file bytes match stored statements. Remote ledger entries and the locally manifest-listed migrations may represent different deployment pathways. Compare against local files and actual catalog state before any production deployment.

## Required next work

1. Compare this metadata to the local repository migration versions and historical source.
2. Match `20261007000241` stored SQL text to the local/historical source, accounting for statement splitting.
3. Determine whether the missing migration effects are already present through targeted read-only catalog checks.
4. Keep any new feature migrations local-only until a reviewed deployment strategy is established.
