# Wingdex photo processing and recovery — 2026-10-08

Branch: `feature/wingdex-photo-voting`. Production project: `vhfxnizaxdanmvmouuaf`.

## Recommendation

For the existing production project, use [the controlled production rollout procedure](wingdex-photo-production-rollout.md). It supersedes this report's separate-staging-project assumption. The candidate migration now includes a submission-scoped claim argument, paired with the worker's --photo-submission-id option. After that change, the combined JavaScript suite had 369 tests (367 passed, two skipped), the Python suite had 53 passed, and TypeScript/Deno checks passed. The older counts below describe the prior candidate revision. No production write was made to prepare the procedure.

**GO for non-production validation; NO-GO for production deployment or recovery.** The local upload/recovery mechanisms are implemented and tested. No production schema, records, objects, jobs, approval statuses, or deployments were changed. No commit, merge, or store build was performed.

A fresh read-only production inspection found 15 approved photos and two withdrawn photos. All 15 approved rows have affirmative consent, living owners, intact originals, approval timestamps/reviewers, and unexpired original retention; none has generation or social publication records. They meet the inspected recovery prerequisites today. Their original image bytes have not been processed or validated by this run, so successful recovery of every photo cannot be claimed yet.

## Root causes addressed

1. Finalization intentionally enters `in_review` with `processing_job_id=null` and the enqueue trigger had been removed. A new atomic insert trigger queues photo derivatives without changing the review-first intake contract. Moderators still use `mango_review_wing_submission`; a new approval guard requires successfully settled real derivatives before a new photo approval. Existing approvals are not reset.
2. The old general processing backlog could silently select approved photos. Its settlement could reverse a human approval on dead-letter failure; exact/AI/perceptual classification could also rewrite moderation. Photos now use a separate explicit queue and settlement. Ordinary backlog scans retain video behavior and exclude photos. A legacy-job guard prevents competing photo inserts/retries. Approved recovery reuses the trusted decoder/normalizer but skips new advisory/duplicate decisions, preserving the original human decision and attribution.
3. The gallery formerly selected a metadata winner before checking assets. The existing fallback fix remains, and the boundary now additionally excludes deleted owners, withdrawal markers, and missing/invalid affirmative consent. It has explicit types, a pinned SDK import, and a real Deno check rather than `@ts-nocheck`.
4. A corrupt declared photo previously fell through to video probing, which could become a retryable missing-FFmpeg error. Photo workers now verify photo decoding before entering the generic processor, so invalid photos fail permanently without publication.

## Recovery architecture

Candidate migration: `crawl/supabase/migrations/20261008171906_wing_photo_derivative_recovery.sql`, created using `supabase migration new`; **not applied to production**.

- `wing_photo_derivative_jobs` has one row per submission, purpose `upload` or `recovery`, four automatic attempts, bounded exponential retry, leased claim tokens, and terminal `succeeded`, `dead`, or `cancelled` outcomes. Explicit operator retry can extend the attempt budget, up to 32 total attempts, without creating another job.
- `wing_photo_derivative_receipts` records upload queuing, every non-dry request, claims, expired leases, success, retry, dead-letter and cancellation. Receipts are append-only, indexed by submission/time, and retained independently of claim retries. Error codes are sanitized; original paths, captions and keys are not audit payloads.
- Both new tables have RLS enabled and no anonymous/authenticated grants or policies. Inventory, request, claim, begin and settlement RPCs have only service-role execution grants and explicit service-role checks. Internal trigger helpers are also revoked from public callers. Existing storage policies and the private bucket are untouched.
- Inventory returns approved photo IDs with missing derivative metadata/objects and blocker codes. Recovery requires an explicit, bounded allowlist. Default dry run locks/checks candidates but writes no jobs, receipts, paths, statuses, or objects. No worker is started by the recovery command.
- Enqueue/begin/settlement check status, original ownership/path identity and existence, withdrawal/deletion, affirmative consent and attribution, moderation blocks, original retention, legacy processing conflicts, and existing publication records. Original retention uses the existing deadline, or creation plus configured original-retention days when no deadline exists; recovery never extends it. Published/in-flight publication records require separate review rather than silently regenerating their assets.
- The worker uses `WingMediaProcessor`, including content decoding, safe limits, orientation normalization, EXIF removal, JPEG primary/thumbnail generation and the existing private Storage adapter. Only server-authorized canonical destinations are accepted. Paths are attached only after both actual Storage objects have positive size and JPEG metadata. Merely guessing a path, uploading one derivative, or receiving a late result cannot mark processing successful.
- `PhotoDerivativeRepository` revalidates the lease and eligibility before each original download and each artifact upload. Settlement locks the submission then the job, rechecks all restrictions, and fences stale tokens. Failed recovery never changes approval, reviewer, consent or attribution. Expired leases are audited and reclaimed with a fresh token; settled-response retries are idempotent for the exact lease.
- Recovery does not enqueue generation/social publication and never transitions approval. Publication-start checks prevent interference with existing publishing work. A narrow Storage race can leave unattached private artifacts after withdrawal/lease expiry; late settlement cannot attach them. Do not delete such artifacts blindly: a resumed job may own them. Inspect them separately after leases/jobs are terminal.

The gallery exposes only safe photo fields. It continues to sign for 300 seconds, uses thumbnail-to-processed fallback, chooses the highest-ranked available photo, paginates after availability checks and returns `picture_count` plus `approved_submission_count`. Expiry metadata is conservatively anchored before signing. Full-photo requests still require the selected processed object. Original retention/deletion after successful processing is allowed by the established cleanup policy; this does not delete approved derivatives. Account deletion and withdrawal prohibit fresh gallery URLs, while previously issued URLs may last until their five-minute expiry.

## Validation executed

- Combined JavaScript suite: **368 tests, 366 passed, zero failed, two skipped** existing rate-limit-copy assertions. This includes gallery/voting/viewer/device tests, upload/validation/promotion/review tests, Journey/rating regressions, recovery command tests, PostgreSQL integration and the actual Deno HTTP test.
- Python trusted processor/repository/worker suite: **51 passed**, zero failed. It checks real JPEG generation and EXIF removal, approved recovery without re-moderation, corrupt originals, cancellation reporting, revalidation before Storage I/O, and CLI failure reporting, alongside existing processor/worker coverage.
- `npm run typecheck`: passed. `deno check --no-config --no-lock supabase/functions/wing-public-gallery/index.ts`: passed with Deno 2.9.7 and the actual pinned SDK types. The Deno binary was downloaded to system temp from its official release and SHA-256 verified; it is not a repository dependency.
- PostgreSQL tests use PGlite and actual finalize, transition, moderator and new queue RPCs. Coverage includes normal finalization → one processing job → review → human approval → gallery, recovery → gallery, duplicate requests, service-only/RLS boundaries, failure/retry, partial assets/batches, stale leases, withdrawal, user/identity deletion, consent/retention restrictions, missing originals, publication races and approval/attribution preservation.
- A local HTTP integration runs the real Python `PhotoDerivativeRepository` and trusted processor against PostgreSQL-backed RPCs and a private Storage fixture. It downloads a real image, creates/uploads real derivatives, settles the job, and verifies gallery eligibility. No production image bytes or keys are involved.
- Actual Deno HTTP execution uses the real Supabase SDK against an isolated local backend, checking PostgREST restrictions, missing-winner fallback, processed viewer fields, empty galleries and the requested signing lifetime. URL expiry is simulated by the local Storage fixture; deployed Supabase expiry, real moderator sessions and two-account concurrency still require staging/live validation.
- Targeted whitespace checks passed. The candidate migration checksum matches its deployment-manifest entry.
- `npm run migration:integrity` remains **failed on pre-existing repository issues**: duplicate timestamp `20260729200000`, historical checksum mismatches and historical unmanifested migrations. The new candidate is manifested with its exact checksum and does not add another duplicate. Historical SQL/checksums were not rewritten. Do not run a blanket production `db push` until the migration ledger is reconciled.

Reproduction from `crawl` (set `WINGDEX_PYTHON` and `WINGDEX_DENO` to installed local executables):

```powershell
node --test --experimental-default-type=module tests/wingdex*.test.mjs tests/wing-photo*.test.mjs tests/journey-photo-device.test.mjs tests/wing-shot*.test.mjs tests/wing-shots*.test.mjs tests/wingShots*.test.mjs tests/wingReviewQueueReconciliation.test.mjs tests/wingProcessingLifecycleFix.test.mjs tests/wing-finalize-processing-job-idempotency.test.mjs tests/image-workflow-runtime.test.mjs tests/image-workflow-mobile-runtime.test.mjs tests/image-workflow-postgres.test.mjs tests/image-first-rating-flow.test.mjs tests/rating-*.test.mjs tests/profile-history-add-image.test.mjs
npm run typecheck
& $env:WINGDEX_DENO check --no-config --no-lock supabase/functions/wing-public-gallery/index.ts
```

From the repository root:

```powershell
& $env:WINGDEX_PYTHON -m pytest Agents/Jalapeno/tests/test_wing_processing_worker.py Agents/Jalapeno/tests/test_wing_processing_repository.py Agents/Jalapeno/tests/test_wing_media_processing.py -q
```

## Future production recovery procedure — not executed

1. First validate the migration, worker configuration, real private Storage uploads, moderator workflow and at least two normal upload/recovery fixtures on an isolated non-production Supabase project. Confirm service-role RPC access, original retention and approval guard behavior. Verify old workers have no active photo leases and that no legacy finalizer/repair command will be used.
2. Before an authorized rollout, pause legacy photo processing and publishing/cleanup jobs for the recovery window. Capture a protected before snapshot of the 15 rows' approval, attribution, consent, counters and current derivative state. Reconcile the migration ledger; apply only the reviewed candidate through the controlled deployment process. Package the new worker beforehand, then schedule the dedicated photo worker after schema availability. No recovery request is part of migration application.
3. Using server-side environment credentials, run inventory. Review all blockers; build a UTF-8 manifest such as `{"submission_ids":["<reviewed UUID>"]}` for one canary. Do not save privileged keys, original paths or signed URLs in the manifest.

```powershell
node crawl/scripts/wing-photo-recovery.mjs --inventory
node crawl/scripts/wing-photo-recovery.mjs --manifest recovery-canary.json
```

4. Only after the production run is separately authorized, explicitly queue the canary. This command checks the actual URL against the named target. Run the photo worker, **not** the legacy stranded-approval repair or general processing command. The worker requires valid trusted processing/moderation configuration; test providers remain forbidden in production.

```powershell
node crawl/scripts/wing-photo-recovery.mjs --manifest recovery-canary.json --execute --expected-project-ref vhfxnizaxdanmvmouuaf
& $env:WINGDEX_PYTHON Agents/Jalapeno/wing_processing_worker_main.py --photo-once
```

5. Inspect the protected job/receipt tables and the actual private objects; compare approval/attribution with the before snapshot. Confirm no generation or publication jobs were added. A dead/cancelled outcome is not success. The photo CLI exits 3 for retry, cancellation, dead-letter or settlement failure; inspect receipts rather than treating a scheduled retry as completion. Wait for retry availability for transient errors; do not repeatedly enqueue new jobs. An expired lease is reclaimed automatically. After resolving a terminal failure, explicitly use `--retry-failed` with the same manifest and target. Missing originals, expired retention, withdrawn/deleted owners or missing consent require policy/operator review, never fabricated paths or resubmission as an automatic workaround.
6. Expand the allowlist in small batches, repeating dry run immediately before execution. Run `--photo-drain N` for a bounded number of already queued jobs. Successful photos remain approved; partially recovered/missing photos retain accurate displayable counts and availability fallback. Restore publisher/cleanup schedules only after reconciliation. Verify all 15 outcomes individually; do not infer success from a job count.

## Deployment order and gallery-v2 compatibility

Order: reconcile ledger and finish staging → package worker → controlled schema migration → enable dedicated photo schedule → explicitly recover/verify canary and remaining photos → deploy gallery only after compatibility gates → deploy/enable matching client → two-account/device smoke and monitoring. The existing public configuration `verify_jwt=false` must remain because gallery reads are public; voting stays a separate authenticated operation. A failed recovery is a reason to hold the gallery rollout, not to reset approval.

The deployed gallery is version 2. Exact source retrieval again failed through the Supabase connector. The previous connector and isolated CLI attempts also failed; repository `74182f0` remains a comparison baseline, not proof of production source. Observed live behavior is counts-only unless `include_images=true`, image fields `submission_id,signed_url`, newest-first order, approved/publishing statuses, and original fallback. The prepared handler adds cover/viewer requests, counters and expiry, available-photo ranking/counts, excludes originals and publishing statuses, and denies deleted/withdrawn/invalid-consent records. Current production has no publishing-status photo rows, but their future behavior is still a material product contract question.

If source cannot be exported, use a contract-based comparison gate on isolated equivalent datasets:

- Capture version-2 status codes, JSON shapes, CORS/cache headers and behavior for anonymous POST, OPTIONS, wrong methods, malformed/empty bodies, invalid/duplicate IDs, 250-destination truncation, fractional/negative/large offsets, page boundaries and service errors.
- Run both contracts on approved original-only, recovered approved, publishing-status, pending/rejected/withdrawn/deleted/consent-restricted, missing-asset and tied-vote fixtures. Explicitly approve the intentional eligibility/order differences; do not assert byte-for-byte source equivalence.
- Verify the client accepts additive `approved_submission_count`, consumes all safe photo fields, handles zero displayable count and expired/unavailable viewer assets, and requests covers/full photos without `include_images`. Confirm originals and privileged metadata never appear in the prepared response, and direct private-bucket reads remain denied.
- Exercise actual staging Storage partial signing errors, pagination beyond 60, batch latency and real 300-second expiry. Run the existing two-account voting/withdrawal/deletion plan in `wingdex-photo-backend-review.md`; reconcile vote counters under concurrent mutations.

Remaining production gates: migration ledger reconciliation; actual Supabase staging migration/worker/Storage/moderator validation; version-2 source export or accepted contract-based equivalence evidence; explicit publishing-status policy decision; authorized recovery and verification of each original's processing result; and two-account/native smoke. No production operation is authorized by this report itself.

## Exact files changed in this continuation

- `Agents/Jalapeno/wing_processing_worker/cli.py`
- `Agents/Jalapeno/wing_processing_worker/models.py`
- `Agents/Jalapeno/wing_processing_worker/worker.py`
- `Agents/Jalapeno/wing_processing_worker/photo_derivatives.py`
- `Agents/Jalapeno/tests/test_wing_processing_worker.py`
- `Agents/Jalapeno/tests/test_wing_processing_repository.py`
- `crawl/supabase/migrations/20261008171906_wing_photo_derivative_recovery.sql`
- `crawl/supabase/functions/wing-public-gallery/index.ts`
- `crawl/scripts/wing-photo-recovery.mjs`
- `crawl/tests/wing-photo-derivative-postgres.test.mjs`
- `crawl/tests/wing-photo-recovery-command.test.mjs`
- `crawl/tests/wingdex-gallery-deno.test.mjs`
- `crawl/tests/wingdex-photo-server.test.mjs`
- `crawl/tests/image-workflow-postgres.test.mjs`
- `docs/deployments/migration-status.md`
- `crawl/docs/wingdex-photo-backend-review.md`
- `crawl/docs/wingdex-photo-processing-recovery.md`
