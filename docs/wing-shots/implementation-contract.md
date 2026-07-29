# Wing Shots implementation contract

## Authority

- Database state is authoritative.
- Clients never set rating eligibility, moderation state, workflow status, priority, scores, rewards, badges, publication outcomes, or reviewer data.
- Every mutation uses an idempotency key and correlation ID.
- Internal RPCs revoke access from `public`, `anon`, and `authenticated`.
- User reads come from sanitized views/RPCs that exclude private paths, fingerprints, reviewer notes, classifier details, provider payloads, and other users' submissions.
- Signed URLs are created on demand, expire within five minutes, and are never persisted, logged, or sent to analytics.

## Rating eligibility

The eligible rating transaction returns:

```json
{
  "rating_id": "uuid",
  "accepted": true,
  "wing_shot_eligible": true,
  "eligibility_reason": "verified_in_person"
}
```

It also creates a unique `rating_verification_receipts` row. Only `in_person_proximity` is eligible. Raw coordinates are never retained.

Eligibility requires an authenticated owner, active valid crawl/restaurant membership, server proximity validation, a complete accepted rating, `is_buffacoin=false`, and no onboarding, administrative, imported, guest, or legacy provenance. Existing ratings are not retroactively eligible.

Rating success is committed before the Wing Shot prompt. Permission denial, skip, cancel, upload failure, processing failure, or modal dismissal can never roll it back.

## Submission and storage

Private bucket: `wing-submissions`.

```text
originals/{user_id}/{submission_id}/source
processed/{submission_id}/primary
thumbnails/{submission_id}/preview
publication/{submission_id}/{platform}/{job_id}
```

- Paths and upload intents are server-generated.
- Clients may insert one original only through a constrained intent; they cannot list, overwrite, move, or edit it.
- Processed, thumbnail, and publication prefixes are service-only.
- Originals are immutable after finalization.
- Bucket MIME/size restrictions are early guards; workers validate magic bytes, decoded content, container, codec, duration, dimensions, and file size.

## State machine

```text
uploaded -> processing | withdrawn
processing -> in_review | failed | withdrawn
failed -> processing | generation_pending | ready_to_post | withdrawn
in_review -> approved | rejected | processing | withdrawn
approved -> generation_pending | withdrawn
generation_pending -> ready_to_post | failed | withdrawn
ready_to_post -> scheduled | posting | withdrawn
scheduled -> posting | ready_to_post | withdrawn
posting -> posted | failed
```

`rejected`, `posted`, and `withdrawn` are terminal. A posted-content review request is a separate audited record.

Transitions use an advisory lock, request fingerprint, `FOR UPDATE`, expected-state precondition, validated graph, mutation, and append-only transition record in one transaction.

## Required data boundaries

- `rating_verification_receipts`
- `app_user_roles`
- `wing_media_submissions`
- `wing_submission_state_transitions`
- `wing_moderation_decisions`
- `wing_processing_jobs`
- `wing_media_fingerprints`
- `social_content_jobs`
- `social_publication_attempts`
- `creator_reward_receipts`
- `wing_social_engagement_claims`
- `wing_admin_actions`
- `wing_nightly_run_receipts`
- posted-content review and deletion/retention audit records

Use existing `xp_ledger`, `badge_catalog`, `user_badges`, notification tables, privacy opt-out, and engagement feature flags.

## Processing and moderation

- Claims use leased `FOR UPDATE SKIP LOCKED` rows, bounded attempts, stale-lease recovery, exponential backoff, and dead-letter state.
- FFmpeg is invoked with argument arrays and no shell interpolation.
- Videos are normalized, bounded, stripped of metadata, permanently muted, thumbnailed, and verified with `ffprobe` to have no audio stream.
- Photos are content-sniffed, orientation-normalized, metadata-stripped, resized, compressed, thumbnailed, and cropped safely.
- Perceptual photo hashes and versioned video fingerprints support duplicate detection.
- AI returns the required structured safety, wing-verification, spam, duplicate, and quality contract.
- AI never identifies faces and never auto-publishes. Human approval is authoritative for the initial release.

## Admin and review

`app_user_roles` and `has_app_role` replace hardcoded identities. Queue preview uses the processed muted asset. Sensitive media is blurred until an audited reveal. Rejections require a safe category; sensitive overrides require notes. Manual priority never bypasses safety.

## Nightly selection and generation

- One America/New_York business-date receipt and advisory lock permit one selection.
- Zero candidates records `SKIPPED_NO_APPROVED_CONTENT` and creates no media or publication jobs.
- Ranking stores auditable components for quality, wing/moderation confidence, rating completeness, freshness, queue age, diversity, recent-feature penalties, media mix, manual priority, and duplicate risk.
- Branded output always derives from approved processed user media.
- No synthesized wings, old-post reuse, fallback to originals, or original audio is permitted.

## Platform jobs

Instagram and Facebook jobs are independent. Unique constraints prevent duplicate submission/platform publication. Dry runs record receipts but never set `posted`.

The first real configured platform success atomically:

1. sets `featured_at`;
2. settles feature reward/badges once;
3. enqueues the featured notification once.

Failure on the other platform remains retryable and never undoes success.

## Creator progression and social claims

- No XP for upload.
- Approval and feature rewards use internal-only, unique reward receipts.
- Creator XP is an auditable subset of ledger sources.
- Reversal uses a linked negative ledger entry.
- Leaderboards are server-authoritative, weekly/all-time, bounded, indexed, and respect social opt-out.
- Social V1 records an honestly labeled visit/self-attestation, never a verified follow.
- A CTA tap alone awards no permanent reward.

## Notifications and analytics

- Creator events use the existing preference, quiet-hour, cap, outbox, and attempt architecture.
- Publication never fails because notification delivery fails.
- Featured deep links validate owner access.
- Analytics is an enforced allowlist of scalar fields. It never accepts signed URLs, paths, filenames, captions, exact location/distance, tokens, moderation flags/explanations, reviewer notes, or provider payloads.

## Retention and deletion

Account deletion order is: authenticate and lock, withdraw unposted content, enumerate/delete private assets, pseudonymize retained audit/publication records, apply the documented reward policy, then delete Auth last.

Initial retention proposal pending legal approval: originals expire 30 days after rejection, withdrawal, or successful publication; derivatives and publication assets have explicit bounded retention.

## Release defaults

All Wing Shot flags start disabled/zero rollout. Publishing starts dry-run with human final approval. The experience includes documented activation steps and is not left permanently disabled.
