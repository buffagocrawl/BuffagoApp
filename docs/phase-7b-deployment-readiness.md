## Final release review ? superseding status

**PARTIAL / production NO-GO; no deployment authorization.** The authoritative current packet is [buffago-final-supabase-deployment-approval.md](buffago-final-supabase-deployment-approval.md). Older counts and readiness statements below are dated historical evidence. Actual transitive L1?L4 definitions, Storage/Auth/gateway acceptance, deletion fence/recovery, predecessor Edge bundles, reviewed trust provisioning and owner maintenance/history approvals remain external gates. Historical integrity and two historical assertions remain red; the exception is not approved. Both feature flags remain false. No production connection, deployment, commit, push or native build occurred.

# Phase 7B.2 — Supabase deployment readiness

Current decision (2026-10-10): **Phase7B.3D PARTIAL; production NO-GO.** Adapter/retry engineering and bounded matched-body tests are implemented; [7B.3D engineering closeout and approval packet](phase-7b3d-approval-packet.md) is authoritative for current gates. Frozen artifacts and both false flags are preserved. Actual transitive behavior/two event handlers/deployed lifecycle, reviewed adapter parity and trust provisioning, history/custom-ledger decisions, window/owner/smoke/rollback artifacts and separate production authorization remain. No Phase7C.

Remaining SQL prerequisites are concrete: bounded Badge/Mango/consumed helper/RPC retry/deployed account-media-Storage and two applicable event-handler behavior; future authenticated verify-full adapter implementation/test/actual read-only identity proof; exact historical reconciliation/exception and ledger mechanism decision; representative index/lock/window/role-DDL freeze/smoke/incident/forward recovery; fresh immediate preflight/snapshot only in approved window; separate SQL/new-ledger/smoke authorization. [Detailed implementation/verification/minimum next action](phase-7b3c-compatibility-and-adapter-plan.md), [updated complete release gate](phase-7b3b-final-release-gate.md), [DRAFT_NOT_APPROVED history decision](phase-7b3c-history-exception-draft.json). B01–B07 must not be rerun now. Gateway/Storage/Edge/native/runtime/predecessor artifacts and distinct enablement/distribution remain API/feature gates. Both defaults false; historical failures unchanged; older pending-catalog/drafting decisions are dated evidence, superseded.

Date: 2026-10-09. Project: `vhfxnizaxdanmvmouuaf`. Branch: `feat/wing-jury-favorites-want-to-try`.

Phase 7B.2 update 2026-10-10: local security fixes are integrated and validation is underway. The appended Phase 7B.2 assessment supersedes the Phase 7B.1 defect descriptions and counts below. No production change is authorized; the historical inventory remains preserved as evidence.

**Status: PARTIAL — local readiness package prepared; production release BLOCKED.** No migrations, Edge Functions, flags, production configuration, commits, pushes, or store builds are authorized or performed. The staged foundation is not a deployable migration. Passing isolated tests does not resolve historical integrity or establish production RLS/concurrency.

## 1. Existing production prerequisites

The object-level inventory and actual evidence belong in [database review](phase-7b-database-review.md). Recheck using [numbered read-only queries](phase-7b-supabase-verification-queries.sql). Evidence must identify the project and inspection date. An absent migration-ledger row is never evidence of an absent schema object.

Required baseline: `auth.users`, `auth.uid()`, `auth.jwt()`; UUID identity and destination keys; destination display/location fields; rating identity, owner, destination, score and timestamp; approved media identity/owner/destination, canonical processed path, consent and withdrawal fields; storage catalog, private `wing-submissions` bucket and working signed-URL boundary; trusted database roles and non-exposed `private` schema. Every dependent column, constraint, index, policy, grant, function and trigger must match the inventory, rather than merely share a name.

No user application records, storage object paths, JWTs, API keys or secret values are needed for reconciliation. Bucket privacy flags are configuration metadata. Actual photo availability and signing behavior require later controlled smoke tests.

## 2. Missing objects and conflicts

The database review distinguishes confirmed absence from unresolved evidence. Four feature tables are required: `user_destination_favorites`, `user_want_to_try`, `wing_jury_votes`, `wing_jury_photo_vote_counts`. Supporting indexes, ownership policies, authenticated-only grants, eligibility validation and transactional cleanup are equally required.

The staged SQL uses `IF NOT EXISTS`, `CREATE OR REPLACE`, and named policy/trigger drops. Those constructs alone cannot validate compatibility or ownership of existing objects. A production plan must abort on any unexpected name/signature/definition/owner/ACL, then separately review a narrowly scoped corrective migration. Preserve unrelated objects and data. Existing historical rating, gallery, rewards and media functions are prerequisites, not replacement targets.

## 3. Forward-only SQL migration order

1. Resolve historical applied-ledger/source-integrity evidence and approve the reconciliation disposition. Do not rewrite historical files, bulk replay 69 roots, or mark unverified versions applied.
2. Capture the numbered read-only catalog results and approve the prerequisite contract, conflict handling and security corrections. Obtain a disposable PostgreSQL/Supabase environment. Baseline failure remains a hard stop.
3. Reserve distinct, monotonically ordered migration versions greater than the verified latest ledger version. Generate actual migration files with `supabase migration new` only after the contract is established. Check local and remote version uniqueness. Keep drafts outside the deploy queue until reviewed; no deployable draft is justified while the current contract is blocked.
4. Draft a read-only fail-closed preflight and transactional additive tables/constraints/indexes. Verify exact FK types, deletion semantics, RLS and grants. Include explicit service-role privileges; do not rely on project default grants. Create only names verified absent; do not silently replace unrelated definitions.
5. Add feature-owned eligibility/cleanup/count functions and triggers with pinned trusted search paths and explicit EXECUTE revocations. Address rating INSERT/UPDATE/DELETE, both identities on reassignment, multiple ratings, lock ordering, immutable votes, concurrent count maintenance and account-deletion counts. Validate these together before treating the staged SQL as releasable.
6. Add authenticated collection RPCs only if the reviewed enforcement architecture requires them. Current clients use direct insert/delete and the vote Edge Function uses the caller's JWT insert; introducing an RPC requires a separately reviewed compatible client/API plan. Never create a bypass RPC accepting arbitrary ownership.
7. Run disposable integration/security/concurrency tests and record migration hashes. Following separate user approval, apply only the approved forward migrations through a controlled runner that cannot replay unrelated pending historical files; record exactly those new versions and verify their definitions. This document authorizes none of these remote steps.

Use one transaction for the small feature schema where feasible so preflight failures roll back all additions. Production index lock time and candidate-query plans need review on representative disposable data; any concurrent-index step requires its own explicit failure/retry plan. Phase 7B.2 corrects the local staged SQL only; historical migration bytes remain unchanged.

## 4. Edge Function order and configuration

See [security and Edge review](phase-7b-security-review.md) for individual readiness findings. Local routes must be exactly `/functions/v1/wing-jury-feed`, `/functions/v1/wing-jury-vote`, `/functions/v1/wing-jury-reveal`. `_shared/wingJury.ts` ships with each function; it is not a deployed endpoint.

After approved SQL and database verification, deploy **feed → vote → reveal**, each including the reviewed shared helper. Keep both flags false throughout. Check feed public DTO and eligibility, then authenticated vote ownership/duplicate behavior, then reveal privacy and UI compatibility. Do not enable a partial function set.

The checked-in `config.toml` now explicitly sets guest feed/reveal `verify_jwt=false` and vote `verify_jwt=true`. Public handlers still verify any bearer token before personalization; vote also verifies a real nonanonymous identity in its handler and inserts under that caller's JWT. Current official [function auth guidance](https://supabase.com/docs/guides/functions/auth) explains the gateway/handler distinction. Real gateway compatibility and browser/JWT smoke tests remain required. Only local configuration changed.

Required runtime names: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Verify presence without printing values. The service role remains server-only; no `EXPO_PUBLIC_` service secret is permitted. Client publishable/anon configuration and API exposure must match the project. Verify OPTIONS/CORS for POST, expected browser origin/header handling, malformed JSON, controlled failures and retry behavior on a real Edge runtime.

## 5. Authentication and RLS

Guests may read approved public photo DTOs and public restaurant reveals after a local verdict signal; that signal is a UI boundary, not proof of a vote. Guests and anonymous-auth users must never persist Jury votes or personal lists. Authenticated ownership is derived from verified auth identity, never body `user_id` or editable metadata.

Enable RLS on all four feature tables. Own-row SELECT/INSERT/DELETE apply to saved lists, with no UPDATE path. Own-row SELECT/INSERT apply to votes, with no client UPDATE/DELETE. Eligibility must be enforced server-side even if client checks are bypassed. Counts permit only approved-photo reads and trusted maintenance. No broadening of existing RLS is allowed. Review effective privileges including PUBLIC inheritance and default ACLs; explicit grants and RLS serve different purposes ([official RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)).

Definer helpers require audited ownership, qualified identifiers, trusted search paths, no public mutation privileges and a non-exposed private schema. Real PostgreSQL role tests are required in addition to PGlite. Account switching must clear private reveal/rating/list state and invalidate in-flight responses before production release.

## 6. Feature flag sequence

Defaults remain `ENABLE_SAVED_DESTINATIONS=false` and `ENABLE_WING_JURY=false`. Development screenshot overrides are process-local and fixture-only.

After all gates and explicit approval: verify the full schema/function set with flags off; enable Saved Destinations for a controlled cohort and verify ownership/cleanup; enable Wing Jury for a controlled cohort and verify guest/signed-in flows; expand only after reviewing failures. These are Expo public build-time flags: plan an approved bundle/update distribution mechanism and verify effective values on devices. Do not assume changing a server environment variable alters an already installed client.

## 7. Verification queries and missing evidence

Run Q01–Q13, including the separate Q09b and Q11b blocks, in [the SQL packet](phase-7b-supabase-verification-queries.sql) against the named project (15 SELECT blocks). All were executed read-only during this review. Q13 verifies the three concrete rating-entry RPC signatures, privileges and INSERT/UPDATE paths needed for cleanup compatibility. Each query includes its expected shape and acceptance criteria. Save catalog metadata only. Re-run after any separately authorized change; fail on incompatible definitions, unexpected grants, missing RLS, wrong trigger events, exposed helpers or public original media.

Separately obtain historical applied SQL/deployment artifacts and hashes for disputed versions and provenance of remote-only versions. This is an existing release gate; the feature inventory does not authorize historical repair.

## 8. Controlled smoke tests

First run locally/disposable with two synthetic accounts, a guest and an anonymous-auth identity, representative destinations/ratings, and approved/rejected/withdrawn/missing-object photos. Verify cross-account list denial; unrated Favorite denial; rated Want to Try denial; rating completion cleanup with rollback/update/reassignment; final-rating deletion cleanup; immutable -1/0/+1 votes; duplicate conflicting retry returns original; concurrent same-user and distinct-user votes; exact counts; public-only signing and expired URL retry; guest no-write behavior; per-user reveal privacy; auth transitions and no-location feed behavior.

Use independent PostgreSQL connections to exercise both race orderings for collection/rating operations and vote/count maintenance. Test actual Supabase Data API roles/JWTs, Storage signing, gateway behavior and browser CORS. PGlite is an isolated logic check, not proof of these runtime guarantees.

Production smoke tests that create accounts, votes, ratings or saved lists are remote writes and require separate approval, scoped test identities/data and cleanup policy. Do not request real user records to prepare them.

## 9. Rollback and emergency disable

Disable both client flags through the approved distribution mechanism; consider already installed clients and update delay. For immediate server containment, separately approve revoking feature-only DML or disabling the three new endpoints; return controlled unavailable responses and preserve unrelated APIs. Record exact prior ACLs/configuration before changing them.

Preserve saved lists, immutable votes and counts. Do not drop feature tables, reset production, undo history or delete user data. Revoke only feature-owned grants/functions when reviewed dependencies permit it. Rating cleanup triggers may be correctness-critical while saved data exists; removal needs a replacement/reconciliation plan. Roll forward with a newly versioned corrective migration. Restore previous reviewed Edge artifacts if compatible with the current schema, with both flags disabled during verification.

## 10. Historical migration blockers

The strict checker still finds 69 root files, duplicate `20260729200000`, five checksum mismatches and seventeen unmanifested files. Full RLS tests still fail their two historical-integrity assertions. Supplied prior ledger evidence is 35 rows through `20261009201342`; remote-only entries and applied-byte identity remain unresolved. See [Phase 2A reconciliation](phase-2a-database-baseline-reconciliation.md). No checker, manifest or historical SQL was weakened or repaired in this phase.

## 11. Device prerequisites and UI evidence

Updated fixture-only Chrome screenshots at 360×800 and 390×844 are linked from [UI polish report](phase-7b-ui-polish.md). They verify web layout, not native rendering or live production media. The mascot fixture is development-only; production image sources use approved signed media and have no mascot fallback.

An Android emulator is attached (`adb devices` reported `emulator-5554 device`); this phase does not claim native acceptance or start a store build. iOS rendering, device auth intents, accessibility/font scaling, safe areas, scrolling, location fallback and real signed image expiry remain to verify with an approved development build and synthetic data. Prior Android/iOS JavaScript exports establish bundle generation only.

## 12. Exact actions needing separate user approval

- Historical ledger repair or reconciliation writes, with a concrete reviewed disposition and authoritative evidence.
- Applying reviewed forward migration versions to any connected project, including production verification writes.
- Deploying the three Edge Functions and altering gateway/runtime configuration or secrets.
- Creating remote test accounts/data or running production write smoke tests.
- Distributing a bundle/update that enables either flag, production cohort rollout or emergency production ACL/endpoint changes.
- Commits, pushes, release/store builds and publication.

No approval is requested in this phase: none of these actions is attempted. Next action is local remediation of the documented security blockers plus historical evidence collection and disposable real PostgreSQL/Supabase testing; release remains blocked until reviewed results and an exact deployment artifact are available.

## Actual validation results

| Check | Actual result |
| --- | --- |
| Existing affected UI/service/navigation/Home/Social/fixture suite | 43/43 pass after polish |
| Phase 2B staged foundation | 7/7 pass, isolated PGlite |
| New database finding reproductions | 5/5 reproduce defects; investigation evidence, not acceptance |
| New Edge/security handler tests | 14 pass, six failing TODO regressions; mocked network/runtime and frontend secret-name assertion |
| Combined staged/findings/Edge/service run | 38 tests: 32 pass, six TODO, zero unexpected failures; exit 0 does not mean release ready |
| Related photo derivative/gallery/auth suite | 29/29 pass with installed Python312 Pillow/requests; initial missing `WINGDEX_PYTHON` failure resolved by selecting that runtime |
| Existing authentication suite | 24/24 pass |
| Historical RLS suite | 50/52 pass; two known integrity assertions fail |
| Migration integrity | FAIL: 69 roots, one duplicate, five mismatches, seventeen unmanifested |
| Database runtime harness | FAIL before initialization: missing `supabase/contracts/buffago-baseline-v1.json` (ENOENT); no database mutation attempted |
| Typecheck / lint | PASS / zero errors, 95 existing warnings |
| Static Edge checks | Four source files transpile without syntax diagnostics; handler tests run via Node mocks, not deployed Deno |
| Secret scan | PASS for 2,134 tracked files; this scanner does not include the untracked initiative files |
| `git diff --check` | PASS; existing LF/CRLF conversion warning only |

See review reports for Docker availability and runtime limits. Preserve failing security regression tests as evidence until a separately reviewed fix passes; do not weaken assertions to turn release readiness green. No standalone Deno check, real multi-session PostgreSQL integration, production RLS execution or live signed-photo smoke test is claimed.

## Phase 7B.2 resumed security assessment (2026-10-10)

This assessment supersedes the Phase 7B.1 defect reproductions above. Local source corrections are integrated; production release remains blocked. The original six executed failing TODO regressions now pass with unchanged assertions and no TODO/skip. Exact names, causes, correction files and acceptance mapping are in [the failure matrix](phase-7b2-failure-matrix.md).

| Phase 7B.1 finding | Classification and evidence |
| --- | --- |
| S-01 inherited privileges/RLS | FIXED BUT LIVE VERIFICATION REQUIRED. Explicit effective table/function ACL normalization, nonanonymous owner policies, protected definer helpers and vote immutability; actual role-based PGlite tests pass. Verify real role inheritance/default privileges, PostgREST exposure and service context. |
| S-02 rating UPDATE cleanup | FIXED BUT LIVE VERIFICATION REQUIRED. BEFORE identity locks and AFTER INSERT/UPDATE Want cleanup; reassignment/rollback SQL tests pass. Verify actual deployed rating/write RPC triggers. |
| S-03 concurrency/lock ordering | FIXED BUT LIVE VERIFICATION REQUIRED. Ordered old/new single-row identity locks, atomic count deltas, unsupported-isolation rejection tested. Independent-session interleavings, multirow deadlocks and whole-transaction retry remain unverified; do not claim global deadlock freedom. |
| S-04 last qualifying rating/Favorite | FIXED BUT LIVE VERIFICATION REQUIRED. Favorite retained across multiple personal ratings, removed after final rating; real SQL tests pass. No automatic Want recreation. |
| S-05 account-cascade count drift | FIXED BUT LIVE VERIFICATION REQUIRED. INSERT/DELETE deltas, auth-parent cascade exception, neutral/dislike/+1 and gallery independence tested in SQL fixture. |
| S-06 signed-out guest | FIXED AND TESTED locally. Realistic missing-session classification permits public feed/local neutral; unexpected authentication failures remain controlled errors. |
| S-07 account transitions | FIXED AND TESTED locally for covered component/hook/service boundaries. Principal epochs, late response guards, token pinning and account-bound intent routes; simulated deferred tests cover switches/logout/unmount. Device sessions/navigation still need acceptance. |
| S-08 malformed votes | FIXED AND TESTED. Strict client/Edge numeric validation, UUID checks, verified caller ownership; SQL constraint/immutable duplicate tests. |
| S-09 cursor disclosure | FIXED AND TESTED. Authenticated encryption, size/TTL/principal/location bounds and tampering tests; current authorization/eligibility remains independent. |
| S-10 absent location | FIXED AND TESTED. No numeric coercion; absent pair fallback, legitimate zero and invalid/partial pairs covered. |
| S-11 anonymous exclusions | FIXED AND TESTED. Anonymous-auth users share guest-local semantics; exclusions sent, no permanent votes/private lists. |
| S-12 gateway/JWT | FIXED BUT LIVE VERIFICATION REQUIRED. Local feed/reveal public gateway, vote verified gateway plus handler authorization; simulated missing/invalid/anonymous auth, CORS/preflight/no-store pass. Deployed gateway/runtime unverified. |
| S-13 historical migration/release gate | STILL BLOCKED. Integrity/provenance and missing baseline contract unresolved; no deployable forward migration or remote change. |
| S-14 archived/deleted Storage | FIXED BUT LIVE VERIFICATION REQUIRED. Shared service-only predicate, active metadata/delete-marker rejection, current consent/approval/owner and before/after signing checks; withdrawn/rejected tests pass. Actual object versions/signing/expiry remain unverified. |
| New views bypassing RLS | NOT APPLICABLE. The staged foundation creates no views; no gallery view or policy is changed. |
| Truncated rating mean | FIXED AND TESTED locally. Service-only all-history aggregate replaces newest-1000-row average without exposing other owners' rows or changing canonical restaurant ratings. |
| Bounded discovery/nearest coverage | STILL BLOCKED for release acceptance. Candidate window is 250 destinations/500 photos; null-coordinate, radius expansion when selected destinations have no eligible media, antimeridian/global nearest behavior and query plans remain unresolved. No unapproved photo is authorized by this limitation. |

The database rejects unsupported REPEATABLE READ/SERIALIZABLE list/rating invariant operations with SQLSTATE 25001; READ COMMITTED is the supported contract. Live PostgreSQL testing must establish independent-session rating/save, duplicate vote, cascade and eligibility-withdrawal behavior. A single PGlite connection and Promise.all calls do not establish concurrency correctness.

Local storage signing succeeds only after trusted eligibility checks, rechecked after signing; vote eligibility is checked again at write time. Already issued 300-second signed URLs may remain usable after withdrawal until expiry. Runtime revocation/accessibility, storage versions, browser/native fetches and private bucket isolation are release gates.

Root verified backend 61/61 and photo/gallery/security 138/138, zero unexpected failures/TODO/skips. Historical RLS remains 50/52 with only the two preserved migration-integrity assertions. Strict migration checker still reports 69 roots, duplicate `20260729200000`, five mismatches and seventeen unmanifested files. Runtime harness fails before initialization with missing `supabase/contracts/buffago-baseline-v1.json`; no database operation occurred. Docker CLI is installed but its daemon pipe is unavailable, local port 54322 refuses connections, and psql/Deno are unavailable.

Final integrated client/auth/navigation/trust run passes 89/89, including 26 new deferred privacy tests, unchanged password-race assertions and existing authentication coverage. Home/Social run passes 24/24. OAuth reserves a verified account's intent before optional setup, discards cancelled/changed claims, and verifies the account revision after telemetry before navigation. Shared-helper behavior is tested; full OAuth callback/device execution remains unverified. Independent reviewer reran 115/115 across database19, Edge/service42 and client54, and closed its final Medium OAuth finding; no remaining High/Medium privacy or authorization defect was identified in the reviewed local implementation.

Final typecheck passes; lint passes with zero errors and 103 warnings (no suppression); `git diff --check` passes. The exact 27-file Phase 7B.2 inventory, recovered work, ownership, test logs and resume instructions are recorded in the final handoff. These are local tests, not a production readiness declaration. Next phase is disposable PostgreSQL/Supabase validation and historical baseline reconciliation; migration preparation must wait for those gates. No deployment or production activity is authorized.

## Phase 7B.2.5 FINAL authoritative checkpoint (2026-10-10)

**PASS for authorized local scope; COMPLETE and STOPPED. Production and Phase 7B.3 migration preparation remain BLOCKED by prerequisites below.** This checkpoint supersedes all earlier pending/Docker-unavailable/candidate-cap statements. Existing tracked/untracked work was recovered in place. Prior agents were unavailable; completed feed/lint files and logs were inspected directly. A new specialist finished independent review and corrected its one concrete UI finding.

### Actual PostgreSQL results

Recovered crawl/.expo/phase7b25-postgres-final.log completed at 08:29: 19/19 PASS, zero fail/skip/TODO,120,821 ms. Tested staged SQL and database tests predate this completed log and were unchanged during resume, so the expensive suite was not repeated. Reverified buffago-phase7b25-e5de47ce1daf: cached postgres:17.6, disposable label, network none, no published ports; read-only version probe returned actual PostgreSQL 17.6 and buffago_phase7b25. Two earlier disposable containers retained; development Supabase untouched. Tmpfs data survives only while containers run; no cleanup attempted.

Actual independent psql backends and pg_blocking_pids waits cover both rating/Want and final-rating/Favorite race orderings, UPDATE/reassignment, rollback, immutable neutral/+1/-1 uniqueness, conflicting duplicate original verdict, same/distinct-user vote races, atomic +1-only Likes, account cascades, photo withdrawal/existing Storage archival locks, READ COMMITTED enforcement, real multistatement deadlock and whole-transaction retry. Gallery votes/counters remain unchanged; Jury does not write restaurant ratings. Inherited default ACL normalization and fixed-search-path helper grants are tested. PostgreSQL enforces actual RLS under SET ROLE anon/authenticated on synthetic prerequisite tables, with auth.uid/auth.jwt backed by session GUC fixture claims. This is database-enforced authorization with simulated identity, NOT cryptographically verified Supabase Auth/PostgREST/Edge gateway acceptance.

Catalog acceptance traverses1,003 destinations / 702 eligible photos, including 300 nearer destinations without eligible photos; all-history aggregate includes 1,002 ratings. Typed SQL accepts numeric strings; strict original JSON types are enforced by Edge tests, not SQL casts. EXPLAIN ANALYZE on extracted current RPC body: located 28.959 ms (eligible scan/nested loop/top-N distance sort), no-location 21.967 ms; list 0.116 ms, rating 0.160 ms, Storage 0.099 ms, authenticated RLS list 0.104 ms. Small synthetic plans do not certify production scale: distance ordering can scan/sort eligible catalog per page. Retain realistic load/query-plan gate.

### Feed, guest policy and independent review

Preserved service-only full-catalog keyset RPC, worldwide Haversine ordering/no radius cutoff, deterministic destination/microsecond-time/photo ties, final missing-coordinate tier, <=24 visible photos and <=120 candidates per SQL page, bounded Edge work/signing. Auth exclusions precede LIMIT. AES-GCM principal/location/TTL-bound cursor is blind; malformed/tampered cursors fail safely. Stream end alone means exhaustion. Four automatic empty-page advances then usable FEED_CONTINUE retain progress; actual-game Continue regression passes.

slice(-500) is ONLY a bounded request hint. Complete local session Set filters every returned photo, including older IDs no longer sent. Existing 700-verdict regression proves old/new judged IDs cannot reach gameplay. Local memory grows with distinct judged photos; requests stay <=500 UUIDs. No probabilistic exclusion or new server-session dependency. Retry/continuation retains Set; close/unmount/account transition clears it. Account/request guards reject stale feed responses.

Independent reviewer found broken-image Skip during pending vote/reveal could attach previous reveal to next photo. Fixed per-photo/account/operation response guards, single-flight reveal retry, guarded Skip and stale image-error rejection; three new deferred actual-game regressions pass. No additional concrete ACL/definer/SQL race/cursor/privacy/flag defect identified. Both flags default false; runtime/scale gates retained.

### Verification

- Recovered PostgreSQL 19/19 PASS: .expo/phase7b25-postgres-final.log (unchanged tested SQL).
- Recovered feed backend 48/48 PASS: .expo/phase7b25-feed-final.log.
- Resume affected foundation/feed-pagination/Edge/privacy/service/UI/navigation/password-races 114/114 PASS: .expo/phase7b25-resume-affected.log (before final UI correction).
- Final corrected game/feed-client/privacy 41/41 PASS: .expo/phase7b25-final-game.log; privacy 30/30 includes three new deferred regressions. Specialist privacy 30/30 overlaps (.expo/phase7b25-final-review-privacy.log).
- Final typecheck PASS exit 0: .expo/phase7b25-final-typecheck.log.
- Final lint PASS exit 0:0 errors / 95 warnings: .expo/phase7b25-final-lint.log. Eight added accountScope hook warnings removed without suppression.
- Historical RLS rerun 50/52: ONLY known current-schema checksum-stable and recovered Phase 1 unique-root assertions fail (.expo/phase7b25-resume-rls.log).
- Strict migration checker FAIL unchanged: 69 roots, duplicate 20260729200000, five checksum mismatches, seventeen unmanifested (.expo/phase7b25-resume-integrity.log).
- git diff --check PASS, existing line-ending notices only.

Counts overlap; do not sum as unique tests. Unchanged prior Home/Social 24/24, auth 24/24 and photo/gallery/security 138/138 preserved as recovered evidence, not new runs. No assertions weakened. Missing supabase/contracts/buffago-baseline-v1.json still blocks separate legacy runtime harness; isolatedPG runner does not need it.

### Exact Phase 7B.2.5 changed/added files (16)

1. crawl/scripts/phase7b25-postgres.mjs
2. crawl/tests/database/fixtures/phase7b25-postgres-bootstrap.sql
3. crawl/tests/database/phase7b25-postgres-integration.test.mjs
4. crawl/supabase/local/phase-2b/20261009_local_phase2b_foundation.sql
5. crawl/supabase/local/phase-2b/README.md
6. crawl/supabase/functions/_shared/wingJury.ts
7. crawl/supabase/functions/wing-jury-feed/index.ts
8. crawl/tests/wing-jury-feed-pagination.test.mjs
9. crawl/tests/wing-jury-feed-client.test.mjs
10. crawl/lib/wingJuryService.js
11. crawl/components/WingJuryGame.jsx
12. crawl/tests/client-account-privacy.test.mjs
13. crawl/app/(tabs)/ratings/index.jsx
14. docs/phase-5-wing-jury-api-contract.md
15. docs/phase-7b-deployment-readiness.md
16. docs/codex-handoff.md

This resume edited only game, privacy tests and three docs. Other dirty initiative files predate this finish and remain preserved. Ignored logs under crawl/.expo are local evidence, not release artifacts.

### Remaining gates and exact next action

Do not begin Phase 7B.3 here. Migration preparation cannot begin until authoritative applied-byte historical ledger/duplicate/checksum/unmanifested evidence and missing baseline contract are resolved, catalog parity and actual disposable Supabase Auth/PostgREST/Edge JWT/CORS/Deno/Storage versions/signing/fetchability/expiry verified, representative-scale discovery measured and native auth/navigation/accessibility accepted. Already issued 300-second URLs may survive withdrawal until expiry. No forward production migration prepared.

Exact next action: separately scoped historical-baseline evidence reconciliation and disposable Supabase runtime acceptance plan, retaining both flags false. Local PostgreSQL and discovery-cap blockers are now closed; production prerequisites remain.

Safety: branch feat/wing-jury-favorites-want-to-try; HEAD 960a5422cb9aa8f59acd47e009937cceb8d90291 unchanged. No commits/pushes/new branches/worktrees/production reads or writes/remote migrations/deployments/feature enablement/historical SQL edits/stack stops or resets/destructive cleanup. Handoff updated; Phase 7B.2.5 complete and stopped.
## Phase 7B.2.6 FINAL - production baseline and migration gate (2026-10-10)

**Phase 7B.2.6 PASS for analysis/documentation; complete and STOPPED.** Production baseline compatibility is PARTIAL, Phase 7B.3 drafting is CONDITIONAL and not yet authorized, production SQL application and feature enablement are NOT ready. This checkpoint supersedes blanket earlier requirements that all historical byte artifacts, native QA and deployed Edge acceptance precede any local nondeployable draft. It does not waive application/enablement gates or historical failures.

Authoritative analysis: [production baseline contract](phase-7b-production-baseline-contract.md). Pending handoff packet: [four remaining verification SELECTs](phase-7b-remaining-verification.sql). No remote queries were executed in this phase. Do not run the original fifteen catalog blocks again merely to reproduce already established facts.

### Verified baseline and explicit unknowns

Existing 2026-10-09 production catalog evidence confirms canonical UUID auth/destination/rating/media keys, NUMERIC coordinates/generated rating score, TIMESTAMPTZ creation/withdrawal metadata, private wing-submissions bucket, auth helper signatures, three persisted-rating RPC signatures/events, mutable gallery vote separation, existing RLS and broad inherited/default ACLs. Four feature tables and original nine private helper names were absent then. Production ledger is a separate dated 35-row metadata inventory, NOT a full source/deployment artifact or proof of SQL nonexecution for absent versions.

Current staging inventory is exact: four tables, fourteen functions (eleven private/three public), nine triggers, nine policies, six explicit indexes plus four PK indexes. Staging convenience IF NOT EXISTS/OR REPLACE/drops are not production fail-closed preflight. No implementation or staged SQL changed.

UNVERIFIED: five later function names/overloads, global index/type collisions and two newer rating trigger names; omitted media/crawl keys/CHECKs/incoming deletion edges; safe existing trigger/dependency source closure; actual API/current-owner role inheritance/authority and precisely retained client-read policy details. The four packet blocks fill these metadata gaps without application records, auth-user/storage-object rows, function bodies, trigger argument values, arbitrary settings or migration SQL text. Profile lifecycle is included. Any observed incompatible mandatory prerequisite becomes category A and stops the draft. New media ON DELETE RESTRICT may affect existing hard-delete/cascade behavior; actual deletion design/source closure is an application gate. READ COMMITTED is required even for null-owner rating events through cleanup helpers; the BEFORE helper alone skipping null identity is not an isolation exception.

### Historical decision

- Duplicate 20260729200000: B current deployment tooling blocker, plus C provenance debt and D applied-path identity. Freeze BOTH files. No deletion/rename/retimestamp/replay/mark-applied.
- Five genuine checksum discrepancies: C, D exact deployed bytes/mapping; keep ordinary strict pipeline blocked (B). Three July copy/category changes have no demonstrated new-feature dependency. October RC/current gallery candidate need safe deployed artifact comparison for historical equivalence; current relevant catalog/dependency compatibility can be established separately. No anomaly alone demonstrates A new-schema incompatibility.
- Seventeen unmanifested roots: C/D, with duplicate-fixed also B. Three exact versions recorded (20260729160000,20260730120000,20260730222132), fourteen absent. Missing ledger/manifest rows never prove missing objects. Local staging-transport/cron names are not equivalent to different remote timestamps merely by name.
- Current root-glob apply-engagement-migrations runner is unsuitable; it replays every root. Legacy runtime harness missing JSON is a tooling/baseline-pack limitation and would still report blocked/not-run if JSON merely restored. This Markdown contract is not that JSON or a clean-init pass. Do not weaken strict assertions/checkers.

Recommended strategy: quarantined forward-only draft after narrow contract clearance; exact new-artifact-only release package/runner for any later application, never root replay/db push from this checkout. Applying with unresolved history requires explicit HUMAN frozen-history exception naming all anomalies/remote-only mappings/residual D questions, approved target and exact new versions/hashes. Preserve failed historical checks and record exception separately; do not claim integrity repaired. No exception or later action is approved here.

### Three gates and exact next action

1. Drafting: obtain and review RV01-RV04; approve bounded deletion/coexistence/owner contract; separately authorize Phase 7B.3 quarantined draft. Historical unrelated artifacts and native/deployed Edge tests are not blockers to writing a conditional local draft. Draft needs unique CLI-generated future versions and fail-closed preflight; none generated now.
2. SQL application: completed draft, exact hashes/versions, fresh target/ledger maximum, catalog conflict/drift preflight, safe relevant baseline source and production-shaped disposable PG/Supabase role/RPC/RLS tests, transaction/index/locking plan, approved feature-only runner and historical disposition/exception. Separate exact application approval. Flags remain false; rating triggers affect existing flows immediately, so their compatibility cannot wait for enablement.
3. Enablement: verified applied SQL; separately approved feed->vote->reveal/shared/config deployment; real JWT/gateway/CORS/Deno/Storage versions/signing/fetchability/expiry, actual ratings and realistic feed scale, native auth/navigation/accessibility, approved synthetic live tests and emergency disable. Separate cohort/bundle flag approval. Retain data/cleanup invariants, use forward corrective versions; previously issued 300-second signed URLs may outlive withdrawal.

Exact next action: bring docs/phase-7b-remaining-verification.sql to ChatGPT's authorized READ-ONLY connector for vhfxnizaxdanmvmouuaf, return four separate metadata result sets with project/date, classify only concrete remaining contract gaps, review proposed historical exception, then decide whether to authorize Phase 7B.3. No migration creation/application or deployment in this phase.

### Actual verification and files

Final four SQL blocks executed successfully ONLY in already verified disposable buffago-phase7b25-e5de47ce1daf / buffago_phase7b25_1, postgres 17.6, labelled, network none, no host ports, BEGIN READ ONLY then ROLLBACK; exit 0. This is syntax/catalog-projection validation, not fresh production evidence. Log: crawl/.expo/phase7b26-packet-local-validation.log.

Source inventory/document links/read-only statement scan PASS: 4 tables/14 functions/9 triggers/9 policies/6 explicit indexes and four pending SELECT blocks. Initial inventory check found shorthand policy names; final contract now enumerates all nine exactly and check passes. Focused unchanged migration-integrity tests: 3/5 PASS, ONLY the same checksum-stable and unique-root integrity assertions fail; log crawl/.expo/phase7b26-integrity-focused.log. No assertions altered. git diff --check PASS. No large UI/concurrency/feed suite repeated; preserve completed Phase 7B.2.5 PostgreSQL 19/19 and its lint 0 errors / 95 warnings/typecheck exit 0 evidence.

High-reasoning GPT-6.1 Sol specialists independently reviewed architecture and migration safety, then final contract/packet. They identified missing namespace coverage, isolation wording, role-owner authority and profile lifecycle metadata; root corrected the documents/packet. No feature source or migration tooling edits. Ignored specialist reports: crawl/.expo/phase7b26-architecture.md and phase7b26-migration-safety.md.

Exactly four repository documents created/updated in this phase:

- docs/phase-7b-production-baseline-contract.md (new)
- docs/phase-7b-remaining-verification.sql (new, pending remote execution)
- docs/phase-7b-deployment-readiness.md (updated)
- docs/codex-handoff.md (updated)

Git safety: feat/wing-jury-favorites-want-to-try, HEAD 960a5422cb9aa8f59acd47e009937cceb8d90291 unchanged. Pre-existing tracked/untracked work preserved. No commits/pushes/branches/worktrees/remote calls/writes/ledger changes/remote migrations/Edge deployments/feature flag changes/history edits/builds/stack stops/resets/destructive cleanup. Both feature defaults false. Phase 7B.2.6 stop condition reached; Phase 7B.3 not started.
## Phase 7B.3 authoritative readiness checkpoint — 2026-10-10

All four RV queries executed successfully through ChatGPT's connected read-only integration; [verified report](buffago_rv01_rv04_production_results_2026-10-10.md) is incorporated in the [baseline contract](phase-7b-production-baseline-contract.md). No Supabase query/write executed by this phase. The user authorized local preparation on the existing branch.

RV01 clears 21 checked names. RV02 establishes crawl UUID PK, media rating/destination RESTRICT, owner SET NULL and gallery CASCADE plus other media restrictions. RV03 establishes 18 trigger attachments. RV04 establishes unprivileged ordinary API roles/trusted-schema CREATE denial, broad preexisting table grants and public ratings SELECT. New-object explicit revokes/RLS preserve collection privacy independently; do not claim product-wide blind rating privacy or change baseline grants.

**Draft gate remains conditional and unmet. No uniquely versioned draft was generated.** Returned exact constraints/fingerprints/owner rows are omitted from the summary; actual reward source/dependency closure is missing locally, and new Jury media RESTRICT retention/support for deletion paths is not established. This is a concrete compatibility/evidence gap, not a blanket historical-byte/native-test prerequisite to drafting. [Full review](phase-7b3-local-preparation-review.md) distinguishes local candidates/models from actual production parity and identifies smallest residual evidence.

Application remains blocked by that contract, exact CLI-generated drafts/hashes and fail-closed preflight/negative rollback verification, production-shaped actual rating RPC/trigger/role/Storage tests, historical reconciliation or explicit frozen-history exception, reviewed exact-artifact-only runner, fresh target/catalog/ledger/DDL owner and Data API exposure, index/lock/transaction plan, supported existing-flow smoke and separate application approval. Current root-glob runner/db push prohibited; strict failed checks preserved. No implicit exception or missing legacy JSON/harness pass.

Enablement additionally requires actual gateway/Auth/JWT/anonymous/CORS/Deno/Storage signing/version/expiry, representative scale/native acceptance, approved live tests/emergency containment and separately authorized Edge/config/client/cohort delivery. Flags stay false; SQL rating triggers would run even with flags false.

Local PG17.6 summary-model and integration verification results are in the final handoff. Account/rating RESTRICT rollback and pseudonymization candidates were tested; notification/reward witnesses are synthetic ordering probes, not deployed-function acceptance. Historical focused tests remain 3/5 PASS, two unchanged integrity failures. No historical SQL/assertions/checkers modified.

Next action: recover already returned nonsecret RV02–RV04 fields and safe relevant attached-trigger/dependency source, establish retention/deletion and trusted-owner contract, then resume quarantined CLI-generated draft preparation and exact-draft tests. No production application can safely be authorized now.

Final Phase 7B.3 verification: disposable PG17.6 **24/24 PASS** (19 existing plus five summary models), integrity **3/5 PASS with two unchanged failures**, diff whitespace check PASS. Versioned drafts deferred; production parity/application remain unverified and blocked. See final handoff for exact commands, logs, container identities and remaining work.

## Phase 7B.3A authoritative readiness — 2026-10-10

| Gate | Verdict |
| --- | --- |
| Local migration drafting | YES; authorized quarantined draft prepared at version 20261010192747. |
| Production migration application | NO; specific behavior/runtime/history-disposition/executor gates remain. |
| Feature enablement | NO; SQL/Edge/Storage/Auth/scale/native acceptance and separate release approvals remain. |

[Exact evidence](buffago_7b3_production_catalog_exact_evidence_2026-10-10.md) supplies nineteen validated foundational/media definitions, twenty incoming media FK actions, eighteen enabled attachment definitions/MD5, trusted function owners and observed postgres CREATE/TRIGGER authority. The former exact-metadata gaps are closed for drafting; MD5 is neither behavior proof nor historical-file provenance.

[Complete deployment runbook](phase-7b3a-deployment-runbook.md) is authoritative for compatibility decisions, preflight, artifact order, post-apply verification, failure handling/emergency disable and complete blocker list. [Pinned package](../crawl/supabase/local/phase-7b3a/draft-package.json) contains exact SHA-256 of the CLI-generated [single forward migration](../crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql) and separate strict read-only production fingerprint preflight. Offline package verifier has no remote apply capability; exact-artifact-only production executor/new-version ledger recording remains an application gate.

Four new tables/fourteen functions/nine triggers/nine policies/six explicit indexes prepared with explicit postgres ownership, trusted pg_catalog paths, named constraints, effective ACL normalization and restrictive RLS. No existing helper/trigger is replaced. Votes/counts media CASCADE adds no new hard-delete veto; withdrawal preserves immutable rows/counts but removes eligibility. Account cascade decrements retained media counts; physical media cascade removes counts without FK-order dependence. Baseline rating/destination media RESTRICT and all twenty incoming media edges remain; supported actual deletion orchestration remains to verify. Unicode consent trim now matches the observed gallery boundary.

Safe local body comparisons: guard, notification and pseudonymization match raw MD5; gallery helpers match LF MD5; Mango differs. Existing reward/notification/wallet/RPC/transitive locks, unmatched/unavailable media/Storage/account helpers and real role/Auth/PostgREST/gateway/storage behavior remain named application gates. Exact attachment/source-shaped fixture acceptance is not full production parity. Strict fingerprint preflight deliberately rejects the surrogate Badge body; no production check is bypassed or rehashed for fixtures.

Historical strict tooling remains BLOCKED with duplicate20260729200000/five mismatches/seventeen unmanifested and missing legacy baseline JSON/harness. No history/manifest/checker changes or implicit frozen-history exception. Current root-glob runner/db push remain prohibited. Separate human historical disposition, tested feature-only mechanism, fresh target/PG/catalog/ledger/owner/ACL/private exposure, index/lock/timeouts and existing-flow smoke/containment plan are required before exact application approval. Flags false do not suppress rating cleanup triggers.

Separate enablement additionally requires approved SQL/post-apply evidence and compatible feed→vote→reveal/shared/config delivery, real JWT/anonymous/CORS/Deno/Storage version/signing/fetchability/expiry, representative scale/native auth/navigation/accessibility, approved live tests and emergency procedures, then explicit bundle/cohort flag authorization. Both defaults remain false.

Final actual verification is recorded in handoff. Stop after local preparation; production cannot safely be authorized now. No commits/pushes/new branches/worktrees/production calls/writes/remote applications/deployments/feature enablement/historical edits/destructive cleanup.

Final frozen Phase7B.3A local results: exact draft acceptance15/15 PG17.6 plus package3/3 (combined18/18), staged PG regression19/19, Edge/service52/52, typecheck PASS. Strict integrity3/5 focused with unchanged2 failures;69 roots/duplicate1/mismatch5/unmanifested17. Complete final hashes/files/container identities/limits in handoff/runbook. Phase7B.3A local preparation PASS and stopped; production application and feature enablement NOT READY.

## Phase7B.3D closeout gates

**Phase7B.3D PARTIAL; production NO-GO.** Adapter/retry engineering and bounded matched-body tests are implemented; [7B.3D engineering closeout and approval packet](phase-7b3d-approval-packet.md) is authoritative for current gates. Frozen artifacts and both false flags are preserved. Actual transitive behavior/two event handlers/deployed lifecycle, reviewed adapter parity and trust provisioning, history/custom-ledger decisions, window/owner/smoke/rollback artifacts and separate production authorization remain. No Phase7C.

Closed locally: explicit whole-RPC 40P01/40001 retry with stable operation/input; matched Home/Crawl/media/account boundary execution; fixed-target signed TLS/SCRAM adapter policy, persistent framing, durable evidence and common-snapshot recovery; feature-only existing kernel/six-column ledger compatibility. These are bounded proofs with labelled synthetic dependencies. B01-B07 is not repeated; no catalog observation substitutes for behavior. Branden is only the proposed incident/recovery owner, and no production smoke is authorized. The exception draft remains DRAFT_NOT_APPROVED. See the final handoff for exact tests and file inventory.


## Phase7B.3D final engineering verification

Final verification: PostgreSQL17.6 closeout **34/34 PASS**, zero failures/skips (366978.528ms): executor14, compatibility4, adapter9 (seven offline policy/protocol checks plus two real PostgreSQL atomic/recovery and TLS/SCRAM checks), matched-body behavior7. Thus27 checks use actual disposable PostgreSQL. Log: crawl/.expo/phase7b3d-postgres-closeout.log. Client regressions **60/60 PASS**, zero failures/skips (23578.4061ms), log crawl/.expo/phase7b3d-client-verified.log. Typecheck **PASS, exit0**, log crawl/.expo/phase7b3d-typecheck-verified.log. Frozen package verification and git diff --check PASS. Earlier failed/interrupted logs are retained diagnostics, superseded by these final results.

**PARTIAL; production NO-GO.** Local engineering gates close; actual helper/event-handler/deployed lifecycle acceptance, complete adapter parity/review and external trust provisioning remain technical gates. Historical exception/custom-ledger compatibility, approved locking window, accepted named owner, bounded smoke scope and exact rollback artifacts remain human decisions. The exception draft is not approved. See [approval packet](phase-7b3d-approval-packet.md). No production session or Phase7C.
