# Phase 7B.2 failure matrix

Established 2026-10-09 from the unchanged baseline before implementation. Branch: `feat/wing-jury-favorites-want-to-try`. Baseline combined command: 38 tests, 32 pass, six executed failing TODOs; five passing database reproductions assert defects rather than acceptance. No remote operations authorized.

All six original tests are in `crawl/tests/wing-jury-edge-security.test.mjs`. Names and assertions must remain; TODO metadata can be removed after correction.

| Exact test name (original line) | Expected / actual | Root cause and impact | Files and correction | Verification |
| --- | --- | --- | --- | --- |
| malformed verdict payloads cannot silently create an immutable neutral vote (292) | HTTP 400, no write / HTTP 200 and neutral write for null | Number coercion accepts nonnumeric input; immutable corrupt verdict | vote handler, shared client service: strict numeric -1/0/+1 | Original assertions plus strings, missing, fractions, invalid IDs; no writes |
| blind feed cursor does not disclose the hidden destination identity (301) | Decoded cursor omits destination / base64 JSON exposes it | Encoding mistaken for opacity; premature identity disclosure and unvalidated cursor | feed/shared Edge: encrypted authenticated bounded cursor tied to principal/location and expiry | Original disclosure assertion, tamper/context/expiry/pagination tests |
| real signed-out Supabase session can fetch the guest feed (312) | Guest feed succeeds / AUTH_LOOKUP_FAILED | Missing session treated as unexpected error; public guest feature inaccessible | wingJuryService.js: recognize AuthSessionMissingError only | Original realistic missing-session fixture; other auth errors stay failures |
| real signed-out Supabase session can record an in-memory neutral verdict (320) | Local judged state, no backend call / AUTH_LOOKUP_FAILED | Same missing-session classification; guest voting broken | wingJuryService.js: same classification | Original neutral/no-call assertions; guest reveal and counts unaffected |
| absent location selects the documented nonlocation fallback (330) | null/empty invalid, real zero valid / null becomes zero | Number coercion invents location and ordering | shared Edge coordinate validator and client feed serializer: real finite numbers | Original three assertions plus partial/range/nonfinite inputs |
| anonymous-auth gameplay sends its in-memory judged IDs to the guest feed (337) | Local judged IDs sent / empty list | user.id alone used for authenticated classification; anonymous guests repeat photos | wingJuryService.js and relevant saved service: consistent nonanonymous principal | Original asserted body; anonymous no permanent vote or list access |

## Complete Phase 7B.1 finding map and planned acceptance

| Finding | Regression coverage / correction |
| --- | --- |
| S-01 inherited broad privileges | Database findings test for representative default ALL ACLs becomes denied UPDATE/DELETE/TRUNCATE acceptance; add all four table ACLs, PUBLIC/default function execution, own/cross-user/anon role behavior. Explicitly revoke before narrow grants; immutable defense. |
| S-02 rating UPDATE/reassignment cleanup | Database UPDATE finding becomes zero Want to Try acceptance; add old/new user/destination, rollback and score-only update behavior. |
| S-03 concurrency and lock ordering | BEFORE rating lock plus AFTER reconciliation; delta count arithmetic. PGlite sequential behavior does not verify independent sessions: genuine READ COMMITTED races/deadlocks remain live-runtime gate. |
| S-04 multiple-rating Favorite deletion | Database multiple-rating finding becomes retained Favorite then last-rating deletion removes it; never auto-create Want to Try. |
| S-05 account-cascade count drift | Database cascade finding becomes zero count; preserve neutral/dislike/+1 and gallery independence with duplicate retry coverage. |
| S-06 missing-session guest | Original tests three/four above plus saved service guest handling. |
| S-07 account-transition privacy | New behavioral delayed component/hook/service requests across guest→A, A→B, logout, close/unmount; same-principal token refresh; replay intent bound to account; no stale ratings/list/reveal state. |
| S-08 malformed votes | Original first TODO plus strict client/Edge adversarial values. DB smallint constraint is numeric enforcement, not a JSON-type boundary. |
| S-09 cursor identity | Original second TODO plus encryption/authentication/tampering/context tests; eligibility rechecked independently. |
| S-10 absent location | Original fifth TODO plus partial and malformed coordinate coverage. |
| S-11 anonymous exclusion | Original sixth TODO plus saved-list anonymous denial. |
| S-12 gateway configuration | Local config feed/reveal JWT false, vote JWT true; handler tests missing/invalid/anonymous identities and preflight. Actual gateway/JWT browser checks remain live-runtime gate. |
| S-13 migration/release gate | Historical-integrity assertions retained separately; no deployable migration, flags remain false. No test can resolve missing provenance. |
| S-14 archived/deleted storage | Database predicate finding becomes denied eligibility/vote; Edge service-only eligibility RPC paired with signing and recheck; withdrawn/rejected/missing/invalid consent scenarios. Real Storage signing/expiry remain live-runtime gate. |

Additional review limits: bounded candidate-window feed coverage (250 destinations/500 photos), browser CORS, signed URL lifetime and Deno runtime must be explicitly reported. The truncated rating mean is corrected by the service-only all-history aggregate RPC and covered by regression tests. No client-verdict signal authorizes private data. No historical migration assertions are weakened.

Ownership: database agent owns local staged SQL/DB tests; Edge agent owns shared/three handlers/config/Edge tests; client agent owns Jury/list/auth privacy/service/UI tests. Orchestrator approved shared eligibility RPC, strict verdicts, account epochs and encrypted cursor contracts, owns documentation and integrated verification. Independent reviewer will inspect integrated files and behavior after implementation.

## Resume verification milestone (2026-10-10)

All six original regressions pass with their original assertions retained and TODO metadata removed. Root combined backend verification: 61/61 (19 database, 36 Edge, six service), zero failures/skips/TODO. Database tests execute actual SQL and role ACL/RLS behavior in isolated PGlite; Edge/service tests execute implementation with simulated network/auth/runtime. Independent reviewers reproduced 19/19 and 42/42 separately. This does not establish live Supabase or independent-session PostgreSQL behavior.

Database acceptance additionally rejects cross-owner reads/writes, anonymous writes, inherited privileged execution, verdict mutation and unsupported transaction isolation; verifies neutral persistence, +1-only deltas, cascade cleanup, rating rollback/reassignment/multiple-rating cleanup, and withdrawn/rejected/archived/delete-marker eligibility. The shared lock helper requires READ COMMITTED and rejects REPEATABLE READ/SERIALIZABLE with `saved_destination_invariants_require_read_committed` (SQLSTATE 25001). Genuine multi-session races and deadlocks remain a runtime gate.

Integrated client review found and corrected late private rating results, pending intent/account mismatch, automatic guest-token substitution, anonymous initial-session login latching, competing signup redirects, terminal feed loading, and Buffacoin transaction token substitution. Deferred component/hook tests supplement service tests; final results and OAuth intent disposition are recorded in the readiness assessment and latest handoff.
