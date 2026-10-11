# Buffago Phase 7B — Live production-catalog verification

**Inspection date:** 2026-10-10
**Supabase project:** `vhfxnizaxdanmvmouuaf`
**Source:** Connected Supabase read-only SQL integration
**Changes applied:** **None**. No DDL, DML, migrations, deployments, or feature flag changes.
**Input:** `docs/phase-7b-remaining-verification.sql` (uploaded to ChatGPT).

## RV01 — Proposed-object namespace collisions

**Query executed successfully.** All 21 checked names reported `exists=false`:

- Five functions: `private.lock_rating_collection_identities`, `private.enforce_wing_jury_vote_immutability`, `public.is_public_wing_jury_photo`, `public.wing_jury_restaurant_rating_summary`, `public.wing_jury_feed_candidates`.
- Two triggers: `destination_ratings_lock_collection_identities`, `destination_ratings_update_want_to_try`.
- Ten indexes/key names: `user_destination_favorites_destination_idx`, `user_want_to_try_destination_idx`, `wing_jury_votes_user_idx`, `wing_jury_photo_vote_counts_like_idx`, `wing_media_submissions_wing_jury_candidate_idx`, `wing_jury_votes_submission_vote_idx`, `user_destination_favorites_pkey`, `user_want_to_try_pkey`, `wing_jury_votes_pkey`, `wing_jury_photo_vote_counts_pkey`.
- Four composite type names: `user_destination_favorites`, `user_want_to_try`, `wing_jury_votes`, `wing_jury_photo_vote_counts`.

**Interpretation:** No name collision for the requested object set as of inspection. This does not prove broader schema compatibility.

## RV02 — Foreign keys, constraints and deletion behavior

**Query executed successfully.** Key verified facts:

- `public.crawls` is a table, and `crawl_id` is `uuid NOT NULL` with primary key.
- `public.wing_media_submissions` is a table, and `id` is its primary key.
- Media submission `rating_id` references `destination_ratings(id) ON DELETE RESTRICT`.
- Media submission `destination_id` references `destinations(id) ON DELETE RESTRICT`.
- Media submission `user_id` references `auth.users(id) ON DELETE SET NULL`; owner pseudonymization check requires appropriate `owner_deleted_at` state.
- Existing gallery vote `submission_id` references `wing_media_submissions(id) ON DELETE CASCADE`.
- Existing gallery vote `user_id` references `auth.users(id) ON DELETE CASCADE`.
- Several other production entities reference media submissions with `ON DELETE RESTRICT` (moderation, jobs, rewards, etc.). Therefore, do **not** assume physical media row deletion is generally possible; favor explicit withdrawal/ineligibility policy and verify expected foreign-key behavior.
- Media constraints enforce approval/rejection shapes, status options including `approved`, `posted`, `withdrawn`, and consent/ownership/storage path structure. Check the staged Jury eligibility predicate against the exact production values.
- Existing destination ratings reference destinations and users with `ON DELETE CASCADE`.
- `crawls.route_id` references routes with `ON DELETE CASCADE`.

**Interpretation:** Baseline identities and major lifecycle constraints exist. Media hard-delete and rating-delete interactions must be validated against existing restrictions and lifecycle logic before migration application.

## RV03 — Existing attached trigger metadata

**Query executed successfully.** There are 18 noninternal trigger attachments across the requested tables in the returned result:

- `public.destination_ratings`: `destination_rating_friend_notification` (AFTER INSERT), `guard_buffacoin_rating_writes` (BEFORE INSERT/UPDATE), `trg_rating_after_insert` (AFTER INSERT).
- `public.wing_media_submissions`: `mango_clear_ineligible_priority` (BEFORE UPDATE), `wing_media_submissions_owner_pseudonymization` (BEFORE UPDATE), `wing_photo_approval_guard` (BEFORE UPDATE), `wing_photo_upload_derivatives` (AFTER INSERT).
- `public.wing_media_photo_votes`: `trg_refresh_wing_media_photo_vote_counts` (AFTER INSERT/UPDATE/DELETE) and `trg_validate_wing_media_photo_vote` (BEFORE INSERT/UPDATE).
- `auth.users`: `auth_user_referral_code`, `auth_user_referral_deletion_signal`, `on_auth_user_created`, `referral_code_profile_eligibility_auth`.
- `public.users`: `referral_code_profile_eligibility`, `referral_code_profile_eligibility_delete`, `trg_new_user_starting_coins`.
- `storage.objects`: `protect_objects_delete`, `update_objects_updated_at`.

The returned metadata shows some existing public-schema SECURITY DEFINER trigger functions with broadly granted EXECUTE ACLs, such as `handle_new_auth_user`, `enqueue_friend_rating_notification`, and `Badge_Add_Rating_Milestones`. **This is an existing permissions review item, not evidence that the new Wing Jury code introduced it or that those trigger-only functions are directly exploitable.** Assess reachability and source safely; do not change existing production privileges without separate approval.

**Interpretation:** New rating cleanup triggers must coexist with preexisting rating/reward/notification triggers. Review relevant function bodies locally and test order/locking in the disposable PostgreSQL replica; do not replace existing triggers.

## RV04 — Effective roles, grants and policies

**Query executed successfully; complete requested privilege/policy categories captured and summarized.**

**Roles:** `anon` and `authenticated` are neither superusers nor BYPASSRLS, and have no reachable privileged inherited memberships in this result. `service_role` and `postgres` are BYPASSRLS. The trusted owner roles `supabase_auth_admin` and `supabase_storage_admin` were also identified.

**Schemas:** For both `anon` and `authenticated`, `CREATE=false` in `auth`, `private`, `public`, and `storage`. They have `USAGE=false` on `private`, and `USAGE=true` on the other three schemas. `postgres` has `USAGE=true, CREATE=true` on `private` and `public`; it does not have CREATE on `auth` or `storage`. `service_role` has no CREATE in the four schemas and no USAGE on `private`. This supports keeping new private helpers in the `private` schema and owned by an appropriate trusted DDL role, but Supabase Data API exposure is a separate configuration check.

**Prerequisite table effective grants:**

| Relation | anon/authenticated SELECT | anon/authenticated UPDATE | anon/authenticated TRIGGER | RLS | Owner |
|---|---|---|---|---|---|
| `public.destinations` | Yes | Yes | Yes | Enabled | postgres |
| `public.destination_ratings` | Yes | Yes | Yes | Enabled | postgres |
| `public.wing_media_submissions` | No | No | No | Enabled | postgres |
| `storage.objects` | Yes | Yes | Yes | Enabled | supabase_storage_admin |
| `auth.users` | No | No | No | Enabled | supabase_auth_admin |

`service_role` has SELECT/UPDATE/TRIGGER on all listed public/storage prerequisites, but not `auth.users` through the direct table privilege checks. Database ownership and privileged function behavior require careful review, not an assumption that the service role can directly read every relation.

**Existing client read policies (selected from `pg_policies`):**

- `public.destination_ratings`: `public read ratings` (`TO PUBLIC`, `USING true`, SELECT); `user can read own ratings` (`TO PUBLIC`, `USING auth.uid()=user_id`, SELECT); `guests can read guest ratings` (`TO anon`, `USING user_id IS NULL`, SELECT); and `auth can manage own ratings` (`TO authenticated`, ALL, owner-checked USING/WITH CHECK).
- `public.destinations`: `destinations_public_read` and `public read destinations` (`TO PUBLIC`, SELECT, `USING true`); `destinations_write_by_creator` (`TO PUBLIC`, ALL, owner-checked USING/WITH CHECK).

**Important existing permissions finding:** RLS on `public.destination_ratings` does not make its SELECT rows private, because the effective `TO PUBLIC USING true` SELECT policy permits reading all ratings for roles with table SELECT. Similarly, `anon`/`authenticated` have broad underlying UPDATE/TRIGGER table grants on ratings and destinations, though RLS still constrains normal row changes. These are **preexisting production permissions**. Do not change them in this Wing Jury migration without a separate security/release analysis. The Wing Jury reveal service must enforce its own pre-vote identity boundaries and avoid claiming that all restaurant-rating data is private in the wider Buffago product.

**Interpretation:** RV04's narrow role/policy inventory is now verified. For new tables, set explicit role grants and restrictive RLS, and confirm gateway/private-schema exposure separately; no privileged path was identified for ordinary `anon` or `authenticated` roles from role inheritance alone.

## Recommendation and release gates

1. **Quarantined local migration drafting:** RV01 has no name collisions; RV02/RV03 document lifecycle constraints; RV04 documents actual effective grants and policies. Codex can *analyze and prepare* a proposed draft with no remote application, but should specifically review existing-trigger coexistence and the inherited broad grants shown in RV04. Whether the project's formal Phase 7B.3 gate permits drafting must be decided against the documented baseline contract.
2. **Production migration application:** **NOT APPROVED / NOT READY.** Must resolve privilege/deletion/trigger interactions exposed by RV02–RV04, historical migration tooling/exception decision, local release-artifact verification, secure deployment mechanism, and live test plan.
3. **Production feature enablement:** **NOT APPROVED.** Live Edge/RLS/Storage/gateway tests and native acceptance still outstanding.
4. No changes were made to the Supabase project during these checks.

## Exact next action

Provide this report to Codex and ask it to update `docs/phase-7b-production-baseline-contract.md`, `docs/phase-7b-deployment-readiness.md` and `docs/codex-handoff.md`. Have it identify the smallest residual verification required, including review of the verified broad existing table grants and rating read policies, and propose an isolated Phase 7B.3 local-only drafting gate. **Do not deploy or enable either feature.**
