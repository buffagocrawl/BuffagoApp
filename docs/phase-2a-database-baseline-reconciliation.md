# Buffago Phase 2A — Database Baseline Reconciliation

Updated: 2026-10-09

Status: PARTIAL / BLOCKED for new migration work. Investigation is complete. No historical migration, manifest hash, timestamp, RLS policy, database, remote ledger, or production environment was changed.

## Scope and safety

- Branch verified: `feat/wing-jury-favorites-want-to-try`.
- No new worktree or branch was created.
- No commit, push, deployment, remote migration, production query, production write, or database reset was performed.
- The linked-project marker exists locally, but no linked/remote command was run.

## 1. Migration integrity result

Command from `crawl/`:

```text
npm run migration:integrity
```

Result: FAIL — 69 root migrations, 0 legacy archives, one duplicate timestamp, 27 checksum mismatches, and 17 unmanifested migrations.

### Duplicate timestamp

| Timestamp | File | Historical commit |
|---|---|---|
| `20260729200000` | `crawl/supabase/migrations/20260729200000_duplicate_media_classification.sql` | `2dd3625` — Clarify duplicate Wing Shot processing failures |
| `20260729200000` | `crawl/supabase/migrations/20260729200000_duplicate_media_classification_fixed.sql` | `f19635c` — Duplicate Video logic |

Root cause: a later corrective migration reused the already-used timestamp. The current PowerShell duplicate guard groups complete filenames, so it misses this condition; the JavaScript checker correctly groups by the 14-digit version. Supabase migration ordering/history cannot safely distinguish two root files with the same version. The `_fixed` file is also unmanifested. No rename, delete, timestamp change, or ledger repair is safe without authoritative applied-ledger and applied-byte evidence.

### Checksum mismatches

`expected` is the SHA-256 recorded in `docs/deployments/migration-status.md`; `actual` is the SHA-256 of the current root file bytes.

| File | Expected | Actual | Classification |
|---|---|---|---|
| `20260729120000_wing_shots_core.sql` | `60a82c0031934d92df11551d0b7b01318357ae5a61462b5497c1c1f692f7d04e` | `61bd8a81c0f961f9c232ce9a16447e80ef5308e43e7ef22f4ac9ed30ec077275` | LF-normalized match |
| `20260729120500_wing_shots_rating_provenance.sql` | `891838dc9d3b1b6a9dc637c3918bfb6f93d4d40bce63caa2dd8c3b2d88450bb5` | `94372946a8089ed538ade3dd7952ea912abb90433eb88f54bdafe1fe9aa86b6c` | LF-normalized match |
| `20260729121000_wing_shots_security_rpc.sql` | `0aa4bc0cc75a3bbcfc6c640dd2aa966b65ee2a7c092f7a3fdef167262c6080a9` | `afc78b8ca5b0e74a7c0da661b2124f53a41c12d8e640b49a3df102e3ec1d9edc` | LF-normalized match |
| `20260729122000_wing_shots_creator_rewards.sql` | `6f8fe2f0669957fca64019c7e0c18fc0a37a234f4ae08fbb0025cb7829f979ea` | `6a94f22b2adfa5c88589b16ac23eab5b4a805b92d4657150cb12719a38ad331d` | Content mismatch; edited in `193e6b0` |
| `20260729123000_wing_shots_feature_flags.sql` | `5b072e5e4d78b3e529216fe333bb1db578392d628bf38db0de6e6b50f81c220f` | `fe5e758490763adcc143b5f83e4080c3cce643618e1d858c22f9070ef44025f0` | LF-normalized match |
| `20260729124000_wing_shots_moderation_selection.sql` | `c4737df9e24328d97a42d32a59b532803c4aec2b6fe76a25ac52a3c4bd2b17b0` | `3fea4a8045b2a7edb542833820f839b86bd5722ac97b093d190127077eca15ae` | LF-normalized match |
| `20260729125000_wing_shots_social_community.sql` | `350c0734721ca60171a4d61d6fd65351801a0d1564775880938eb7ec632eb325` | `e6de72d70a67beec9ee6e0bc00bdbadba64d221630b887602fc2096c0ac2e1f8` | LF-normalized match |
| `20260729126000_wing_shots_notifications.sql` | `c1074cd6c7cdaaa3c146beb8af85a6c81bc9c0b85457d5cc94ad46c76949814c` | `9b2edb26ed98cdc290c1eb6ba5d2d486a985d37647551845a97fd57c0962ec69` | Content mismatch; edited in `f66fd00` |
| `20260729127000_wing_shots_home_rating.sql` | `a25bbe5730b83b3bc2deaaaff620d489086590bcabd64fd3099f2844c39a9d5a` | `12099155774192db9ace0b2d8134a3ff38e7a1b23cbaa8b164ebf72202bf80b1` | LF-normalized match |
| `20260729128000_wing_shots_admin_review_surface.sql` | `aea7f5d9eee3c7fe2ac4ea25d154d53cb14a007b2ad51ceadedda33b4eb6a6c3` | `7229b41b52b9449cc0e7f1d0a31054d6796a887aca2911d6fed505ed8de51805` | LF-normalized match |
| `20260729129000_verified_progression_xp.sql` | `8c18e51b839ab31f7b4aa624ca883f879735484771ac422c07461a36fb158cdc` | `b19fb74182ee7fa2b622900a90ee95215dea1aa5c560ea25a78e95c22decfc50` | LF-normalized match |
| `20260729130000_wing_shots_publishing_rpc.sql` | `7cb9c0db0f7277d99f5dba7465de8c42e4af1b82a96be3a628fb977d35a5e3c9` | `ab1163b5f5099576e287c2c86e9c5edd12e070a502ad99fe0d9c587e05895003` | LF-normalized match |
| `20260729132000_wing_creator_surfaces.sql` | `c14f309aa392e4c63c6237ead2e2f1c0b774ebb50b5a2e556e4bb523997be5c7` | `d35b05546307cce4ec95ffb625cd14beb78bc687fdbfb610bed40c5894a35921` | Content mismatch; edited in `193e6b0` |
| `20260729133000_wing_processing_worker_contract.sql` | `1f8f009d9853db56abf36c86226750657838b5911ae616ed88290cd316f0de05` | `08a49da30e8b39c01e8b6deb700dc3f2b007781cefa9cb3a2b0daff107a61287` | LF-normalized match |
| `20260729134000_wing_generation_worker_contract.sql` | `2ce7d8b4ca9e20a048aba0bf306f5264b6915c16a6f65f1be608b4dc00071845` | `032c6ad0a3a6da046799b3f503ffdb90650111f2abade5b747db565769cc8c72` | LF-normalized match |
| `20260729135000_retire_legacy_jalapeno_media.sql` | `2b8ee7169e1279264e6a0140899d5bcb1e12ff1de4c7c698dd54d37eae52f5cc` | `17c79c0a2d4a84a07796a1851bba73e52b71de8c9fe84498ee1b09323e0b74f4` | LF-normalized match |
| `20260729136000_wing_upload_retry_after_expiry.sql` | `e5d311705d1661ee1c3c73146bc4ee3aea59366be102c5aff834000d9d8ce278` | `504153a8e9e0bd7e43f1bdf12be50cc445dc3644338451b60db7c3ceaee16dbc` | LF-normalized match |
| `20260729153000_serrano_trust_repair.sql` | `d2d8e3d4d0dcc9a2ad49475d06babdea267c35926dd446da85265396c002c9c7` | `cea14d175e6d9db6aafa52123eee977ff0189a34a2c76b2e1ecade2666e18dc2` | LF-normalized match |
| `20260729180000_wing_processing_lifecycle_fix.sql` | `d474ca7124708f817cfd05580980d231b082a73c4f54eaccb5665459b71c3bb9` | `c184279d2d3a9aa81781f1e9147634948ab10a4a378d12a45782520f86e20413` | LF-normalized match |
| `20260731005535_wing_finalize_service_role_promotion_contract.sql` | `374a24057c5a87dc0e4a9753721c523492870497b06b87d5be3328fa4e3c1a75` | `3580b4b0175a9845dd30803102c3a6f8995a740ea86746928cd77b9d0bce726a` | LF-normalized match |
| `20260731010940_wing_finalize_processing_job_idempotency_recovery.sql` | `634d91fcac98b1441ef05387a29d46b2552c5a91e2b87c16f66aa384fd290ba7` | `9a27fbe4b09f62325fc20e87120497d42ba3531f10b11d47617d2a06ed6b67aa` | LF-normalized match |
| `20260731013034_wing_review_only_finalization.sql` | `4fe419a09722631f5e3061f405f324f60bd012014c11dde02573c7cd65f063d6` | `6d19be5d513da8ee0dbce0a1fb7536d48dc4930fa355eca55df899b629b88dd5` | LF-normalized match |
| `20260802143027_wing_shots_photo_only_upload_enforcement.sql` | `7ab9c5f6d9c556a1756f31794d7d7c7a0619393f34957795a3b28c427ecc24ce` | `0cecd97b96ee6206e3226cfa2c8ef4720086524b96722fc68ede32b61ae78cea` | LF-normalized match |
| `20261007000241_image_workflow_rc_regression.sql` | `4527dee61824d89a477400f0c62bde9b178b77c3b0d52aa638d7222df46b7f94` | `2432798764406bca36c35136ef149247bf9a4c5b5a4ba4b33ecd057cce61f379` | Content mismatch; added/edited in `74182f0` |
| `20261008171906_wing_photo_derivative_recovery.sql` | `d07c40bf89efecf85bfbba8790b2b6e7db8eed5c15a837dcb4a3cf0996bab665` | `cfffdd0ee1f43f01b70131da23406eea088667823707bdf2164a9eb2215efb29` | LF-normalized match |
| `20261008184025_wing_photo_receipt_fixed_search_path.sql` | `46fbf637e5e60e71503fef17b3d10a134716833011bb45a0c3a56726de65a003` | `80de989ff54a1e24f42cc0e74601292e8e3b5f84fba4970762393a4acae5e607` | LF-normalized match |
| `20261008232910_wing_photo_vote_gallery_eligibility.sql` | `d6b445a99e40fd92919ba76bd84a800f98858622141f636ed3802a052fb0168a` | `197f8356136dfa9755e87cf25cda86064780fcf97e23f8f8b4195a3ed50778cd` | Content mismatch; current candidate differs from manifest |

Classification count: 22 line-ending-only mismatches and 5 content mismatches. The earlier Phase 1 count of 24 predates the three October photo migrations now present; current count is 27. The manifest has no repository generator. Its machine-readable seven-column shape was established by commits `2926bf5`, `fd8f114`, and `b39be75`; later entries were manually added as release-candidate records. The manifest says `candidate`/`not applied here` for these files and therefore is not authoritative evidence of deployed bytes.

### Unmanifested migrations

```text
20260729160000_wing_shot_rating_rule.sql
20260729170000_mango_habanero_review_dashboard.sql
20260729171000_mango_habanero_jalapeno_priority_selection.sql
20260729172000_jalapeno_approved_queue_authority.sql
20260729173000_jalapeno_social_attribution_and_location.sql
20260729200000_duplicate_media_classification_fixed.sql
20260729210000_wing_upload_retry_idempotency.sql
20260730120000_wing_shot_uploaded_object_validation.sql
20260730144324_wing_shot_staging_transport.sql
20260730145136_wing_shot_staging_cron.sql
20260730150000_wing_shot_completed_upload_rate_limit.sql
20260730214940_weekly_mission_rating_reconciliation.sql
20260730222132_wing_shot_finalize_legacy_compat.sql
20260730233913_wing_review_intake_lifecycle.sql
20260730235900_wing_review_intake_remove_legacy_finalizer.sql
20260731020000_wing_review_queue_processing_reconciliation.sql
20260731030000_mango_habanero_review_contract_fix.sql
```

Historical context: these files entered Git through the July 29–30 Wing Shot, Jalapeño/Mango Habanero, upload, review, and weekly-mission commits after the manifest was established. The `_fixed` duplicate is a corrective follow-up to the first `20260729200000` file. Adding them to the manifest would change release metadata without proving deployment status; it was not done.

## 2. RLS/security investigation

`npm run test:rls` result: 48/50 pass; exactly two failures:

1. `tests/database/migration-integrity-reconciliation.test.js:14` — `known current-schema migration is explicitly registered and checksum-stable`; actual error `27 !== 0`.
2. `tests/database/migration-integrity-reconciliation.test.js:20` — `recovered Phase 1 migrations are present as unique root files`; actual error `1 !== 0`.

These are migration metadata assertions inside the RLS-named test glob, not RLS authorization failures. They must not be fixed by weakening tests.

Focused command:

```text
node --test --experimental-default-type=module tests/wingdex-photo-vote-postgres.test.mjs tests/wingdex-photo-server.test.mjs tests/wingdex-photo-voting.test.mjs
```

Result: PASS, 35/35. Isolated PGlite fixtures cover own-user RLS reads/mutations, anonymous denial, forged identity rejection, immutable vote identity, approved/consented/live-owner/canonical-derivative eligibility, private bucket boundary assumptions, and persisted counters. This is fixture evidence only, not live catalog/RLS or concurrency proof. The existing photo-vote table/policies are assumed by the prepared eligibility migration and are not established by a creation migration in this checkout.

## 3. Environment/tooling

- `supabase --version`: `2.107.0`.
- `crawl/supabase/config.toml`: local DB port `54322`, Postgres major version `17`, migrations enabled, no schema paths, seed enabled.
- `supabase status` and `supabase migration list --local`: blocked because Docker Desktop/Linux engine is unavailable and `127.0.0.1:54322` refused the connection. No database operation was attempted.
- Existing checker: `crawl/scripts/check-migration-integrity.mjs`; no safe manifest generator found.
- Duplicate guard: `crawl/supabase/validation/duplicate-migration-guard.ps1`; groups full filenames rather than timestamps.
- `current-supported-schema-v1.json` is release-scoped and `supabase/docs/database_map.md` warns exports are incomplete; neither establishes a complete live catalog.

## 4. Decision and safe repair options

No repair was safe to perform. Do not rewrite old SQL, replace hashes, rename or timestamp-shift the duplicate, add unmanifested files blindly, use broad `migration repair`/`db push`/`db reset`, or relax RLS/tests. A safe repair requires authoritative deployment-ledger and applied-byte evidence plus an isolated Postgres runtime. The current schema/migration history cannot yet safely support new Phase 2B migrations.

## 5. Next action

Phase 2B must not begin. Obtain or authorize a baseline-reconciliation procedure that preserves historical semantics, verify a disposable local Postgres runtime, reconcile gallery table/policy creation evidence, rerun migration integrity and security tests, and only then request authorization for additive Favorites, Want to Try, and Wing Jury migrations.

## Recovery addendum — 2026-10-09

The recovery investigation established a repository-consistent point and corrected two validator defects without changing migration SQL or manifest data. A historical replay of manifest-editing snapshots identifies `99c5a8d` (2026-07-29 15:06:58) as the last snapshot with complete manifest coverage, no duplicate version, and no content drift under a line-ending-tolerant comparison. `67a26db` is the first later snapshot with three content-drift files and five unmanifested migrations; later commits added the remaining unmanifested files, the real `20260729200000` collision, and two October content/hash discrepancies.

`crawl/scripts/check-migration-integrity.mjs` now accepts a manifest hash against raw or CRLF-normalized checkout bytes, preserving content mismatches while handling the manifest’s mixed historical LF/CRLF convention. `crawl/supabase/validation/duplicate-migration-guard.ps1` now groups the 14-digit version prefix and correctly reports the duplicate timestamp. Regression tests cover both corrections. The post-fix checker remains intentionally failing: 69 roots, duplicate `20260729200000`, 5 content mismatches, and 17 unmanifested migrations. `npm run test:rls` remains failing only its two strict migration-integrity assertions, now 50/52 because two validator regression tests were added. Focused PGlite photo/security tests remain 32/32.

The remaining blocker is authoritative applied-ledger and applied-byte evidence. The manifest is a candidate/release record and cannot establish production bytes; the repository cannot determine whether the 17 unmanifested files or either duplicate path were applied. Do not rename, delete, retimestamp, rewrite, regenerate, or remotely repair anything. Obtain the linked migration ledger and deployment artifacts/hashes through an authorized human read-only process, then reassess Phase 2B readiness. Docker/Postgres remains unavailable locally, so full Supabase migration/RLS integration cannot be verified here.

## Final reconciliation addendum — supplied production ledger evidence (2026-10-09)

The supplied authorized read-only inspection establishes 35 rows in `supabase_migrations.schema_migrations` for project `vhfxnizaxdanmvmouuaf`, all with stored SQL statements, ranging from `20260625000100` to `20261009201342`. It verifies `20261007000241`, `20261008144550`, and `20261009201342` as recorded; it verifies that `20260729122000`, `20260729126000`, `20260729132000`, `20260729200000`, and `20261008232910` are not recorded. This is authoritative for ledger presence only. It does not prove that absent rows were never executed, because manual or separate deployment tooling may have bypassed the ledger, and it does not prove repository byte identity.

The remote/local comparison is therefore partial but defensible: `20261007000241` is an applied-ledger row with unresolved applied SQL bytes; `20261008144550` and `20261009201342` are remote-only rows with no exact local source in this checkout; `20261008232910` is a local candidate not recorded remotely and must not be reapplied; the three July checksum mismatches are local historical edits with unknown applied status; and `20260729200000` is a genuine local collision with neither path proven applied. A full 35-row comparison still requires the complete ledger output and its stored statement payloads.

The duplicate SQL difference is now recorded precisely: the original uses `o.etag`, while `_fixed` reads `o.metadata->>'eTag'` in both inspection queries. Git provenance is `2dd3625` for the original and `f19635c` for `_fixed`. The 14-digit migration identifier is handled as an opaque ordered version string by the local guard; `20260729126000` looking unlike a real wall-clock time is not, by itself, a Supabase collision or proof of invalidity.

No local repair was safe. The only changes remain the line-ending-aware checker, version-prefix duplicate guard, their regression tests, and documentation. The strict failures remain intentional: migration integrity is still failing with 5 content mismatches, 1 duplicate version, and 17 unmanifested roots; focused photo/security tests are 32/32; `test:rls` is 50/52 with only its two migration-integrity assertions failing; typecheck passes; lint has 0 errors and 95 existing warnings; Docker/Postgres is unavailable. Phase 2B is not authorized.

Required next evidence: full ordered remote ledger with stored statements; deployment/CI SQL artifacts and hashes for the five mismatch versions and the two recorded October versions; read-only catalog-definition comparisons if artifacts are unavailable; proof of any non-ledger application of the 17 unmanifested roots or either duplicate; and a disposable Docker-backed PostgreSQL runtime for clean-init/live RLS verification. Do not modify historical SQL, manifest rows, or remote state while collecting it.

## Phase 2B local-development boundary — 2026-10-09

Phase 2B local development is tracked separately from this blocked historical baseline. A local-only staged foundation was added under `crawl/supabase/local/phase-2b/`; it is not a migration-chain repair, is not included in the integrity manifest, and has not been applied remotely. Its isolated PGlite suite passes 7/7, while full PostgreSQL initialization, true cross-session concurrency, and live Supabase RLS remain unavailable until Docker/Postgres is restored. Phase 2A remains PARTIAL / BLOCKED and Phase 2B release migration authorization remains withheld.

