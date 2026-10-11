# Buffago Phase 7B.3 — Exact production-catalog compatibility evidence

**Date:** 2026-10-10  
**Connected Supabase project:** `vhfxnizaxdanmvmouuaf`  
**Database:** `postgres`  
**Source:** Additional direct read-only PostgreSQL catalog SELECT queries through the connected Supabase integration.  
**Changes made:** None. No DDL, DML, migration, Edge deployment, feature enablement, or application data accessed.  
**Purpose:** Supply exact constraint definitions, trigger attachment definitions, function catalog fingerprints, and observed execution-role privileges missing from the earlier RV01–RV04 *summary*. This supplements, rather than replaces, `buffago_rv01_rv04_production_results_2026-10-10.md`.

## 1. Exact foundational and deletion constraints

All constraints below had `convalidated = true` when inspected. Descriptions below reproduce PostgreSQL `pg_get_constraintdef(..., true)` results.

| Production constraint | Exact definition |
|---|---|
| `crawls.crawls_pkey` | `PRIMARY KEY (crawl_id)` |
| `crawls.crawls_route_id_fkey` | `FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE` |
| `destination_ratings.destination_ratings_pkey` | `PRIMARY KEY (id)` |
| `destination_ratings.destination_ratings_crawl_id_fkey` | `FOREIGN KEY (crawl_id) REFERENCES crawls(crawl_id) ON DELETE CASCADE` |
| `destination_ratings.destination_ratings_destination_id_fkey` | `FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE` |
| `destination_ratings.destination_ratings_user_id_fkey` | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` |
| `destination_ratings.destination_ratings_dest_crawl_user_uniq` | `UNIQUE (destination_id, crawl_id, user_id)` |
| `wing_media_submissions.wing_media_submissions_pkey` | `PRIMARY KEY (id)` |
| `wing_media_submissions.wing_media_submissions_destination_id_fkey` | `FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE RESTRICT` |
| `wing_media_submissions.wing_media_submissions_rating_id_fkey` | `FOREIGN KEY (rating_id) REFERENCES destination_ratings(id) ON DELETE RESTRICT` |
| `wing_media_submissions.wing_media_submissions_user_id_fkey` | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` |
| `wing_media_submissions.wing_media_submissions_one_per_rating` | `UNIQUE (rating_id)` |
| `wing_media_submissions.wing_media_submissions_approval_shape` | `CHECK (approved_at IS NULL AND approved_by IS NULL OR approved_at IS NOT NULL AND approved_by IS NOT NULL)` |
| `wing_media_submissions.wing_media_submissions_owner_deletion_shape` | `CHECK (user_id IS NOT NULL AND owner_deleted_at IS NULL OR user_id IS NULL AND owner_deleted_at IS NOT NULL)` |
| `wing_media_submissions.wing_media_submissions_path_ownership` | `CHECK (split_part(original_storage_path, '/'::text, 3) = id::text AND (user_id IS NOT NULL AND split_part(original_storage_path, '/'::text, 2) = user_id::text OR user_id IS NULL AND owner_deleted_at IS NOT NULL))` |
| `wing_media_submissions.wing_media_submissions_media_type_check` | `CHECK (media_type = ANY (ARRAY['photo'::text, 'video'::text]))` |
| `wing_media_submissions.wing_media_submissions_status_check` | `CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'generation_pending'::text, 'ready_to_post'::text, 'scheduled'::text, 'posting'::text, 'posted'::text, 'failed'::text, 'withdrawn'::text]))` |
| `wing_media_submissions.wing_media_submissions_terminal_shape` | `CHECK ((status <> 'rejected'::text OR rejected_at IS NOT NULL) AND (status <> 'posted'::text OR featured_at IS NOT NULL) AND (status <> 'withdrawn'::text OR withdrawn_at IS NOT NULL))` |
| `wing_media_submissions.wing_media_submissions_rejection_shape` | `CHECK (rejected_at IS NULL AND rejection_reason IS NULL OR rejected_at IS NOT NULL AND rejection_reason IS NOT NULL)` |

The `public.crawls.crawl_id` column was independently verified as `uuid NOT NULL`. The `wing_media_submissions.id` primary key and previously reported UUID contracts exist.

### All incoming foreign keys referencing `wing_media_submissions(id)` (20)

**ON DELETE RESTRICT (15):**

- `social_content_jobs.social_content_jobs_submission_id_fkey`
- `wing_admin_actions.wing_admin_actions_submission_id_fkey`
- `wing_content_review_requests.wing_content_review_requests_submission_id_fkey`
- `wing_creator_badge_events.wing_creator_badge_events_trigger_submission_id_fkey`
- `wing_creator_reward_events.wing_creator_reward_events_submission_id_fkey`
- `wing_generation_jobs.wing_generation_jobs_submission_id_fkey`
- `wing_media_cleanup_jobs.wing_media_cleanup_jobs_submission_id_fkey`
- `wing_media_fingerprints.wing_media_fingerprints_submission_id_fkey`
- `wing_moderation_decisions.wing_moderation_decisions_submission_id_fkey`
- `wing_nightly_run_receipts.wing_nightly_run_receipts_selected_submission_id_fkey`
- `wing_notification_receipts.wing_notification_receipts_submission_id_fkey`
- `wing_photo_derivative_jobs.wing_photo_derivative_jobs_submission_id_fkey`
- `wing_processing_jobs.wing_processing_jobs_submission_id_fkey`
- `wing_submission_abuse_signals.wing_submission_abuse_signals_submission_id_fkey`
- `wing_submission_state_transitions.wing_submission_state_transitions_submission_id_fkey`

**ON DELETE CASCADE (3):**

- `wing_media_access_requests.wing_media_access_requests_submission_id_fkey`
- `wing_media_exact_fingerprints.wing_media_exact_fingerprints_submission_id_fkey`
- `wing_media_photo_votes.wing_media_photo_votes_submission_id_fkey`

**ON DELETE SET NULL (2):**

- `wing_media_fingerprints.wing_media_fingerprints_nearest_submission_id_fkey`
- `wing_submission_abuse_signals.wing_submission_abuse_signals_related_submission_id_fkey`

**Migration design implication:** Physical removal of a media submission already has multiple `RESTRICT` references; do not presume it is permitted. The new Jury vote/count foreign-key action needs an explicit retention/deletion decision. Prefer designing photo withdrawal/ineligibility as a separate logical event from physical deletion, with actual tests for rating/crawl/user deletion and vote-count consistency. Do **not** add another `RESTRICT` constraint casually. Existing media/rating `RESTRICT` can already influence account and crawl deletion behavior.

## 2. Exact existing trigger definitions and fingerprints

The catalog returned **18 non-internal triggers**, all enabled (`tgenabled='O'`). These are *trigger attachment* definitions, not function bodies. Function fingerprints are `md5(pg_proc.prosrc)` and are **not deployed-file provenance or proof of matching repository source**.

| Attached relation | Trigger | Exact `pg_get_triggerdef(oid,true)` | Function source MD5 |
|---|---|---|---|
| `destination_ratings` | `destination_rating_friend_notification` | `CREATE TRIGGER destination_rating_friend_notification AFTER INSERT ON destination_ratings FOR EACH ROW EXECUTE FUNCTION enqueue_friend_rating_notification()` | `698de3165796ddc48b9198b3e7f261b3` |
| `destination_ratings` | `guard_buffacoin_rating_writes` | `CREATE TRIGGER guard_buffacoin_rating_writes BEFORE INSERT OR UPDATE OF is_buffacoin ON destination_ratings FOR EACH ROW EXECUTE FUNCTION guard_buffacoin_rating_writes()` | `b20e1dd1709b7f4f309086cc44e57511` |
| `destination_ratings` | `trg_rating_after_insert` | `CREATE TRIGGER trg_rating_after_insert AFTER INSERT ON destination_ratings FOR EACH ROW EXECUTE FUNCTION "Badge_Add_Rating_Milestones"()` | `298aa31f809efe43252005021f089fc1` |
| `wing_media_submissions` | `mango_clear_ineligible_priority` | `CREATE TRIGGER mango_clear_ineligible_priority BEFORE UPDATE OF status, featured_at, is_publish_priority ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION mango_clear_ineligible_priority()` | `e6afd97295efcd4fd14542212290b7f0` |
| `wing_media_submissions` | `wing_media_submissions_owner_pseudonymization` | `CREATE TRIGGER wing_media_submissions_owner_pseudonymization BEFORE UPDATE OF user_id ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION wing_apply_owner_pseudonymization()` | `de76b9c0f76f833db3712676d0cc1b60` |
| `wing_media_submissions` | `wing_photo_approval_guard` | `CREATE TRIGGER wing_photo_approval_guard BEFORE UPDATE OF status ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION guard_wing_photo_approval()` | `fbe2738b657b8f835692585ba351b55c` |
| `wing_media_submissions` | `wing_photo_upload_derivatives` | `CREATE TRIGGER wing_photo_upload_derivatives AFTER INSERT ON wing_media_submissions FOR EACH ROW EXECUTE FUNCTION enqueue_wing_photo_upload_derivatives()` | `c1ba55009a3532cdc7adfb2d18c5297b` |
| `wing_media_photo_votes` | `trg_refresh_wing_media_photo_vote_counts` | `CREATE TRIGGER trg_refresh_wing_media_photo_vote_counts AFTER INSERT OR DELETE OR UPDATE ON wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.refresh_wing_media_photo_vote_counts()` | `3678ca3e53070266debd85cf6523eea2` |
| `wing_media_photo_votes` | `trg_validate_wing_media_photo_vote` | `CREATE TRIGGER trg_validate_wing_media_photo_vote BEFORE INSERT OR UPDATE ON wing_media_photo_votes FOR EACH ROW EXECUTE FUNCTION private.validate_wing_media_photo_vote()` | `93667fd6433a290d1cf4e89267327649` |
| `auth.users` | `auth_user_referral_code` | `CREATE TRIGGER auth_user_referral_code AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION ensure_new_user_referral_code()` | `5c20b2409660eddfe523ab32b529d1f3` |
| `auth.users` | `auth_user_referral_deletion_signal` | `CREATE TRIGGER auth_user_referral_deletion_signal BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION flag_referral_account_deletion()` | `65b376c54d2fdf603650f063d1f14df6` |
| `auth.users` | `on_auth_user_created` | `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()` | `9c1866c2daeab1351b3d638036472baa` |
| `auth.users` | `referral_code_profile_eligibility_auth` | `CREATE TRIGGER referral_code_profile_eligibility_auth AFTER INSERT OR UPDATE OF deleted_at, banned_until ON auth.users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_auth_change()` | `d382fa0f1aaad9681d5f8d7c4f7aaced` |
| `users` | `referral_code_profile_eligibility` | `CREATE TRIGGER referral_code_profile_eligibility AFTER INSERT OR UPDATE OF user_id ON users FOR EACH ROW EXECUTE FUNCTION restore_referral_code_after_profile_insert()` | `3fc4a3265090b05f937b3705970572fa` |
| `users` | `referral_code_profile_eligibility_delete` | `CREATE TRIGGER referral_code_profile_eligibility_delete AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION refresh_referral_code_after_profile_delete()` | `e11e33204fc8f4bf6cbccc9f58136fe9` |
| `users` | `trg_new_user_starting_coins` | `CREATE TRIGGER trg_new_user_starting_coins AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION give_new_user_starting_coins()` | `5afddf6075ef7f42b26bd91672be9766` |
| `storage.objects` | `protect_objects_delete` | `CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()` | `998d324ea2b1abc49351e8c2367b5796` |
| `storage.objects` | `update_objects_updated_at` | `CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()` | `7596e66a7698d5a6b5129c5ce9b24c5f` |

**Function owner:** All 16 trigger functions attached to application/auth tables above are owned by `postgres`, except the two `storage.objects` helpers which are owned by `supabase_storage_admin`.

**Security:** Photo gallery vote validation and count-refresh functions live in `private`, are SECURITY DEFINER owned by `postgres`, specify `search_path=""`, and grant EXECUTE only to `postgres` in their catalog ACL. `guard_buffacoin_rating_writes()` is SECURITY INVOKER (`prosecdef=false`), search path `public`. The rating friend-notification and badge-trigger functions are SECURITY DEFINER owned by `postgres`, search path `public`, and have broad preexisting EXECUTE ACLs (including `anon` and `authenticated`). This is not evidence those functions can be abused directly; review invocation and implementation before asserting that.

**Important limitation:** Function bodies and arbitrary function configuration were not fetched; they may contain sensitive literals. Consequently, actual PL/pgSQL dependencies, locking behavior, and mutation side effects are **not proved by these metadata records**. Compare *safe, trusted* local source/fingerprints and run integration cases that preserve these trigger surfaces; any remaining unmatched behavior requires specific additional evidence, not assumptions. New triggers on `destination_ratings` must retain all three existing triggers, and must not touch `wing_media_photo_votes` gallery vote behavior.

## 3. Observed authority and role restrictions

The additional live read-only query returned:

| Field | Result |
|---|---|
| `current_user` / `session_user` | `postgres` / `postgres` |
| Database | `postgres` |
| Owner of `public.destination_ratings` | `postgres` |
| Current executor has `TRIGGER` on `destination_ratings` | `true` |
| Current executor can `CREATE` in `private` | `true` |
| Current executor can `CREATE` in `public` | `true` |
| Role `postgres` can attach rating trigger | `true` |
| Role `postgres` can create private function | `true` |

Earlier RV04 established: `anon` and `authenticated` have no BYPASSRLS, cannot CREATE in `private` or `public`, and cannot USAGE the `private` schema; `service_role` has BYPASSRLS but cannot USE `private` directly without explicitly granted access. Existing public `destination_ratings` and `destinations` have broad underlying table grants with RLS applied; existing `destination_ratings` has a `TO PUBLIC USING true` SELECT policy. New Jury private data must not rely on rating data being hidden in the broader product.

**Important limitation:** The current connector ran as `postgres`; the actual later migration executor/connection and Edge runtime roles must be separately verified. Catalog grants do not prove PostgREST exposed-schema configuration or live gateway behavior.

## 4. Narrow decision and remaining release gates

**Supported now:** Locally review and design a quarantined, forward-only migration draft using the above exact constraints/trigger attachments, provided the implementation first selects a media deletion/withdrawal policy, specifies trusted function ownership, checks missing dependencies, and tests trigger coexistence. Do not replace existing functions/triggers or apply a new media retention `RESTRICT` constraint by default.

**Not supported yet:** Authorizing production migration application, migration-ledger repair/exception, new Edge deployment, or feature flag enablement. Historical migration-tooling drift (one duplicate migration timestamp, five genuine checksum mismatches, 17 unmanifested migrations) remains. The supported feature-only migration mechanism, production-shaped function behavior, live RLS/Edge/Storage tests, and native acceptance remain unverified. Formal release approvals are still required.

**Suggested Codex next step:** Consume this exact evidence file; compare it to staged SQL and repository source; make a named decision for the new Jury photo FK action and rating/crawl/account deletion behavior; build a local PostgreSQL fixture with these trigger attachments and safe surrogate bodies where production bodies cannot be verified; draft unique-numbered, forward-only SQL only once compatibility is demonstrated. Explicitly report any behavior not truly verified. Keep all feature flags off; no production writes, commits, or deployments.
