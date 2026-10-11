# Production maintenance and recovery proposal

Status: **DRAFT_NOT_APPROVED; no production connection, smoke, DDL or deployment authorized.** Target only `vhfxnizaxdanmvmouuaf`, direct `db.vhfxnizaxdanmvmouuaf.supabase.co:5432`, database/user `postgres`, verified nonsuper `session_user=current_user=postgres`, BYPASSRLS, PostgreSQL 17.6. A changed runtime fails closed and needs new reviewed evidence. Both client flags stay false throughout this database/Edge release; mobile/native distribution is outside scope.

## Responsibilities and conditions before scheduling

| Required field | Current proposal / required evidence |
| --- | --- |
| Incident owner | Branden proposed; explicit acceptance pending |
| Available backup and contact | UNASSIGNED; must be named and accept before opening a window |
| Window UTC start/end | UNASSIGNED; signed approval must specify both |
| DDL/role/grant/ledger freeze operator | UNASSIGNED; includes other deployers, Dashboard jobs and maintenance |
| Rating write stop operator | UNASSIGNED; must demonstrate gateway/API/database admission containment for Home, Crawl and Buffacoin, including old mobile clients |
| Durable attempt evidence directory | Protected, outside checkout, new exclusive fsynced file per attempt; reviewed ACL and external retention/copy destination required |
| Trust/credential operator | Independently provision approval key, pinned CA and approved psql17.6 distribution/dependent DLLs; protected external PGPASSFILE; never print secrets |
| Smoke uploader/voter/restaurant/crawl IDs | UNASSIGNED; synthetic identities only; explicit scope and cleanup owner required |
| Database restore prerequisites | Owner verifies available backup/PITR and restore procedure read-only; restoration is a separate incident decision, never automatic |

The approved budget keeps `lock_timeout=5s`, `statement_timeout=60s`, and whole attempt at most 15 minutes, also bounded by approval expiry/window end. Local scale measurements are rehearsal evidence, not production sizing. Obtain only scoped row/index/table-size metadata if the production volume materially exceeds rehearsed fixtures. Do not extend timeouts to force success.

## Start, execution and stop sequence

1. Close missing screened L1-L4 behavior correspondence and controlled service acceptance. Review pinned feature, adapter/core/executor, containment, Edge inventory, history exception and history-consumer disposition. Record predecessor Edge bundles/configurations and gateway rate-limit configuration. No broad migration operation is permissible.
2. Owner/backup accept responsibilities. Announce start and enforce coordinated DDL/role/grant/ledger freeze and a brief rating-write pause, including old clients. Keep both flags false. Test operator access to evidence storage without production SQL. Reject missing credentials/trust anchors or unsigned/malformed/expired approvals.
3. Under separately authorized read-only scope verify authenticated control-plane project-to-endpoint mapping, direct TLS verify-full/SCRAM, actual role/session/runtime, storage/gateway boundaries, current blockers, frozen strict preflight and common catalog/whole-ledger snapshot. B01-B07 are dated evidence, not the fresh locked window. A reviewed post-state digest must be independently prepared from that exact baseline and candidate; never auto-adopt the current state. Sign the exact pre/post digests and artifact hashes.
4. Invoke the reviewed `runApproved` library with externally provisioned trust/config and signed `apply` envelope. It emits durable started evidence before connecting, proves identity, runs read-only preflight/snapshot, revalidates authorization, and executes one transaction. It takes an existing-ledger EXCLUSIVE lock and rating/media SHARE ROW EXCLUSIVE locks, compares locked drift/version state, retains frozen strict preflight and exact frozen body, verifies final ownership/RLS/effective rights, inserts only one exact original-SQL ledger row, then COMMITs. No historical SQL replay/row mutation occurs.
5. Require a new verified connection with database-enforced read-only mode for common-snapshot ledger/catalog postflight. `confirmed` means exact reviewed post-state and row, not just a COMMIT acknowledgment. Persist confirmation externally. Any mismatch is an incident; do not adopt it as a new approved digest.
6. Reopen ordinary rating writes only after bounded approved synthetic Home/Crawl/Buffacoin checks prove existing writes/rewards safe. If not safe, follow trigger containment below. Keep feature writes/flags closed. Separately authorized Edge release uses exact packaged feed, vote, reveal plus shared dependencies/config; the account-deletion correction is a separately approved fourth candidate. Test exact gateway/JWT/Storage behavior and rate limits before feature admission. Verify old-client rating/media/account paths still work.
7. Stop by preserving preflight, signed decisions, credential-free identity, all attempt outcomes, independent postflight, smoke IDs/results and incident notes in reviewed durable storage. Record window end and release the freeze only when owner accepts the confirmed state. Android/iOS builds and feature enablement require later authorization.

## Abort thresholds and recovery classification

Abort for any artifact/config/hash/signature/CA/host/role/runtime mismatch, catalog/ledger/ACL/default/handler drift, feature collision, nonforward or existing version, required privilege missing, unavailable evidence sink, unexplained blocker, 5-second lock refusal, 60-second statement refusal, window/approval expiry or deadline. Also abort on unexpected notification/reward/debit, incorrect count/isolation, private URL/identity leakage, failed deletion contract or sustained rating failures. Preserve the failing result; no automatic second application attempt.

| Observation | Required response |
| --- | --- |
| Refusal before write-started | No feature transaction sent; retain evidence, fix only the actual blocker, obtain a valid new decision if required |
| SQL error / disconnect before confirmed COMMIT | Treat as failed-or-unknown until a separately approved read-only recovery confirms exact pre-state; PostgreSQL closes an open transaction atomically |
| Disconnect/process interruption immediately after COMMIT | Outcome unknown; do not replay. Signed `recover` uses one MVCC statement for full catalog and exact six-column ledger row |
| Recovery equals exact approved pre-state, row absent | Rolled back; a later new attempt requires an owner decision and fresh window checks |
| Recovery equals exact approved post-state, exact singleton original SQL and NULL extra fields | Committed; finish independent operational checks, no replay |
| Any other row/catalog combination | Mixed-or-drifted; stop writes/admission, preserve evidence, escalate to owner/backup; never repair/overwrite history |
| Evidence fsync fails | Close transport before evidence cleanup; primary SQLSTATE/write-started/COMMIT status remains available on thrown error. External monitoring records failure; after writes, read-only recovery is mandatory |

## Rating-trigger defect: usable non-destructive containment

Flags cannot protect ordinary rating writes from newly attached database triggers. Proposed exact SQL is [containment candidate](buffago-final-rating-containment-candidate.sql), generated offline from the frozen helper bodies by `crawl/scripts/phase-final-containment-candidate.mjs`. It is **not approved to execute** and is separate from the migration allowlist. Disposable tests verify it restores rating insertion while preserving baseline handlers, feature rows and the original ledger; wrong trigger state refuses atomically.

Owner first blocks all saved-list and Jury admission across gateways/direct clients and pauses affected rating writes. After explicit incident approval bound to the target and candidate hash, the containment transaction locks ratings, verifies original ledger/helper/trigger identity and owner, revokes authenticated list mutation and Jury insertion, and disables only these four new rating attachments:

- `destination_ratings_lock_collection_identities`
- `destination_ratings_remove_want_to_try`
- `destination_ratings_update_want_to_try`
- `destination_ratings_remove_invalid_favorite`

Existing Buffacoin, notification, Badge, referral and all other handlers are preserved. Tables, counts, immutable votes, receipts, media links, FKs and migration ledger remain. Independent read-only confirmation and a scoped ordinary rating check precede reopening rating writes. Saved lists can become stale during containment; retain time bounds and affected-write evidence. Counts/account/media cleanup remains installed. Unexpected drift or lock timeout stops containment instead of disabling arbitrary baseline handlers.

Restore feature mutation rights/attachments only after a newly versioned forward correction fixes the defect, owner approves it, and transactionally reconciles Wants that became rated and Favorites with no surviving rating. Reconciliation must use current rating identity locks, preserve intended saved-list semantics and record impacted rows for review. Reenablement and compensating reward/wallet/media correction are separate decisions. No destructive down migration, guessed Edge predecessor, ledger deletion or FK weakening is a rollback plan.

## Minimal synthetic production acceptance scope for approval

One dedicated uploader, two nonanonymous voters, one guest identity, two disposable restaurants and one crawl. Owner must approve exact IDs, at most one Buffacoin debit and its budget, outbox/referral/reward suppression or expected effects, and cleanup procedure. No real customer/social notifications or public restaurant mutations.

With flags false: one Home fixed-operation insert/replay; one Crawl insertion/conflict update; one Buffacoin fixed-operation insert/replay; Want removal and Favorite eligibility; immutable Jury -1/0/+1 across distinct photos and same-verdict replay; blind feed excludes restaurant identity; only authorized voted reveal exposes it; anonymous/guest/cross-account denials; withdrawn photo disappears while old verdict remains; gallery counts unchanged; active private Storage URL works and invalid/archived/delete-marker URLs fail; CORS/no-store and proposed gateway limits return controlled 429 plus Retry-After. Validate wallet/receipt/outbox deltas exactly, then approved cleanup with established RESTRICT outcomes. Failure injection into Storage/account batches and DDL handlers belongs in a disposable parity/staging acceptance environment, never routine production smoke.

Proposed distributed gateway limits for owner/provider review: feed 60 requests/minute per client IP, reveal 30/minute per verified account (guest/IP separate), vote 30/minute per verified account; burst at most 10, request-size limit 32KiB, no service-role bypass exposed. Prove trusted proxy/IP derivation, counter distribution, spoofing resistance, 429/Retry-After and legitimate mobile paging. These numbers are a proposal, not evidence of an installed limiter. Gateway/WAF capability and acceptance are external prerequisites.
