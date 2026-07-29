# Wing Shots discovery report

Date: 2026-07-29
Branch: `feature/wing-shots-community-content-engine`
Starting commit: `25ba11a06ef1dcb99ae99c0c5fc2fe269082d847`

## Source-control baseline

- `main` was clean and matched `origin/main` at the starting commit after `git fetch origin --prune`.
- The feature branch was created from that exact commit.
- No unrelated permanent branches or worktrees were created.
- Local `.env` files and generated evidence remain uncommitted.

## Existing product seams

- The eligible rating flows are the location-checked crawl flow in `crawl/app/crawl/[id].jsx` and the nearby Home flow in `crawl/app/(tabs)/home/index.jsx`.
- Both eligible flows currently write `destination_ratings` directly. Neither persists authoritative provenance, and the Home path does not return a rating ID.
- The existing `submit_validated_crawl_rating` RPC validates authentication, crawl ownership, route membership, scores, and proximity and returns a rating ID, but the mobile app does not call it.
- Onboarding ratings are local seed/BuffaCoin ratings and are explicitly ineligible.
- Wingdex and auth conversion ratings set `is_buffacoin=true` and are ineligible.
- `is_buffacoin=false` is not sufficient proof of a genuine in-person rating; imported, administrative, legacy, and forged direct rows cannot be excluded without a verification receipt.

## Existing platform capabilities

- `xp_ledger` has a unique idempotency key and is reusable, but `award_xp` and `xp_add` currently allow authenticated callers to choose arbitrary nonzero amounts and sources. Wing Shots must use an internal-only reward boundary, and the generic forgery path is a release blocker.
- Badge definitions are centralized in `badge_catalog`; ownership is in `user_badges`.
- Notification outbox, delivery-attempt, preference, cap, and quiet-hour primitives exist. The current dispatcher does not atomically claim rows and is not reusable for publication jobs.
- Server-authoritative leaderboard and social opt-out patterns exist and should be reused.
- Engagement feature flags support `enabled` and `rollout_percent`; publishing flags must also be enforced by server workers.
- No reusable application moderator/admin role model exists. A legacy rating RPC contains a hardcoded admin UUID, which must not be copied.
- Account deletion removes the Auth user before private media cleanup. Wing Shots requires media-aware deletion with Auth deletion last.

## Storage and media

- No suitable private user-media pattern exists.
- Legacy `jalapeno-assets` and `jalapeno-wing-videos` buckets are public and must not store Wing Shots.
- Legacy video processing preserves audio, can fall back to the original on FFmpeg failure, overwrites by stem, and does not enforce the required content/container/duration/metadata validations.
- New processing must fail closed, produce a permanently muted derivative, strip metadata, generate thumbnails, and prove the processed video has no audio stream.

## Jalapeño and publishing

- GitHub Actions is the scheduler.
- The current daily video route selects and may reuse preloaded video, adds AI copy/overlays, and auto-approves it.
- A separate BuffaGo path fabricates AI imagery.
- Both scheduled production routes must be retired from publishing while historical records remain readable.
- Instagram publishing exists with container polling, retries, persisted receipts, and token redaction.
- Facebook Page publishing does not exist.
- No cross-run advisory lock, atomic candidate claim, or independent Instagram/Facebook job model exists.
- Empty inventory currently permits reuse; Wing Shots must instead record `SKIPPED_NO_APPROVED_CONTENT`.

## Mobile, UX, privacy, and accessibility

- The prompt belongs after rating success, never inside the rating transaction.
- Onboarding has an appropriate explanatory seam and currently does not ask for media permissions.
- Home has a compact seam between the nearby-rating action and lower-priority mission/game content.
- Profile history supports another-user views; private Wing Shot rows must be owner-only and public aggregates must use sanitized RPCs.
- Initial social rewards cannot honestly claim a verified follow. V1 will use clearly labeled Instagram/Facebook Community visit or self-attestation states.
- Consent must be affirmative, versioned, unchecked by default, and independent of rating submission.
- A full-screen, scrollable upload flow is required for 200% text, small devices, safe areas, keyboard handling, focus, and reduced motion.

## Cayenne baseline

- Java, ADB, Maestro, and the Android package are available.
- Existing selector contracts contain 56 unique selectors with no unknown references.
- The root Cayenne harness can run Android/Maestro and collect screenshots, hierarchy, logcat, JUnit, redacted environment evidence, and Serrano handoff.
- It has no iOS runtime adapter and its current accessibility suite is insufficient for large text, screen readers, reduced motion, or clipping. Those limitations must remain explicit until real evidence exists.

## External dependencies

- Rotate/revoke the apparent plaintext Meta credential in ignored `Agents/Jalapeno/.env`; do not reuse it for validation.
- Meta app review/business verification as applicable.
- Instagram professional account and Facebook Page linkage.
- Required production publishing permissions, account/page IDs, access token, and token-expiry procedure.
- Production moderation provider credentials/model approval.
- Production push provider configuration.
- Production Supabase migration, bucket, and policy deployment.
- App-store privacy disclosures and legal approval of consent/retention terms.

Provider-backed publishing remains `CODE_COMPLETE_EXTERNAL_VALIDATION_REQUIRED` until real authorized account calls succeed.
