# Wing Shots threat model

## Assets and trust boundaries

Protected assets:

- original user photos/videos;
- processed derivatives, thumbnails, and generated publication media;
- consent and attribution choices;
- moderation results and reviewer notes;
- rating-verification receipts;
- Creator XP, badges, and leaderboard state;
- publishing credentials, jobs, attempts, and external IDs;
- signed URLs and deletion/withdrawal records.

Trust boundaries:

1. mobile client to authenticated database/RPC;
2. mobile client to private Storage upload;
3. Storage to processing worker;
4. processing worker to moderation provider;
5. admin UI to reviewer RPC;
6. nightly scheduler to database claim and workers;
7. publisher to Meta APIs;
8. notification outbox to provider;
9. account deletion to Storage, audit, rewards, and Auth.

The mobile client, filenames, MIME declarations, media contents, device time, network retries, analytics payloads, and provider responses are untrusted.

## Threats and required controls

| Threat | Severity | Required controls | Verification |
|---|---|---|---|
| Unauthorized media access | Critical | private bucket; no public URLs; owner/reviewer authorization; five-minute signed URLs; sanitized reads | two-user RLS/storage tests; expired URL test |
| Cross-user listing | Critical | no client list privilege; path constraint; owner-only history RPC | User B list/read denial |
| Path traversal/filename injection | High | server-generated object paths; ignore user filename; normalized IDs only | traversal and Unicode filename fixtures |
| Fake MIME/malformed file | Critical | magic-byte/container/codec/decode validation; fail closed | mismatch/corrupt fixtures |
| Oversized media/storage exhaustion | High | bucket limit; decoded-size/duration caps; per-user/day limit; atomic rate counter; abandoned-upload cleanup | boundary and concurrency tests |
| Original overwrite/tampering | Critical | insert-once storage policy; immutable finalized original; separate service prefixes | second insert/update/move denial |
| FFmpeg command injection | Critical | argument arrays; fixed filters/codecs; no shell interpolation; bounded paths | metacharacter fixture; source review |
| Unsafe video fallback/audio leak | Critical | never publish original; `-an`; post-process `ffprobe`; fail closed | synthetic known-audio clip proves zero audio streams |
| EXIF/location disclosure | High | metadata stripping and output inspection | EXIF/GPS fixture and derivative assertion |
| Service-role leakage | Critical | server secret store only; no `EXPO_PUBLIC_*`; log redaction; secret scan | tracked/staged scans and receipt inspection |
| Privilege escalation/forged approval | Critical | managed roles; server role check; expected state; audited actions; no client status writes | non-admin RPC/RLS denial |
| Forged XP/badges | Critical | internal-only reward RPC; unique receipts; allowlisted amounts/sources; generic XP grant remediation | abuse/idempotency tests |
| Duplicate/replayed publication | Critical | unique submission/platform job; leases; advisory lock; persisted provider IDs; reconciliation | simultaneous-run and retry tests |
| Duplicate/replayed reward | Critical | unique rating/submission reward keys; linked reversal ledger | repeated approval/feature tests |
| Signed URL leakage | High | short TTL; no persistence/log/analytics; redact URL-shaped values | log/analytics scan |
| Moderation bypass | Critical | processed media only; structured model contract; human approval; safety constraints unaffected by priority | invalid transition and priority tests |
| Duplicate/spam leaderboard gaming | High | one approval reward per rating; pHash/video fingerprint; rate limits; approved Creator XP ranking | repeated-media/rate/reward tests |
| Faces/minors/PII/offensive content | High | detection flags; sensitive preview blur; human review; safe rejection categories; no facial identification | moderation fixtures and override audit |
| Copyright/consent dispute | High | affirmative versioned consent; attribution choice; pre-post withdrawal; posted review request; admin audit | consent and withdrawal tests |
| Account deletion corruption | Critical | deletion lock; withdraw unposted; enumerate/delete assets; pseudonymize audits; Auth last | deletion fixture across all states |
| Notification privacy/leakage | High | preference/quiet-hour/cap recheck; safe copy; owner-validated deep link; delivery independent of publish | notification eligibility/deep-link tests |
| Analytics privacy leak | High | event-name and metadata allowlists; block URL/path/caption/moderation/provider values | sanitizer rejection tests |
| Provider token expiry/rate limit | High | config preflight; bounded exponential retry; classified errors; no false success | 401/403/429/5xx adapter fixtures |
| Scheduler double run/DST | Critical | America/New_York business date; unique receipt; advisory lock; atomic claim; workflow concurrency | two-session/DST tests |
| Empty-content fabrication/reuse | Critical | explicit skip receipt; approved submission required for generation; legacy route disabled | no-candidate and unreachable-route tests |
| Database migration partial failure | High | transactional migrations where supported; rerun guards; preflight; rollback notes | clean/partial migration tests |

## Privacy decisions

- Do not retain raw user coordinates in verification receipts.
- Do not create facial embeddings, identities, or biometric templates.
- Keep classifier detail, fingerprints, and reviewer notes service/reviewer-only.
- Expose only safe rejection categories to contributors.
- Anonymous attribution removes username/display name but does not hide the restaurant or rating.
- Originals have bounded retention; audit and publication records are pseudonymized where retention is required.
- Published content is not silently removed by deleting history; it enters an audited review/takedown workflow.

## Abuse invariants

- Uploading alone never creates XP or leaderboard credit.
- Rejected, failed, withdrawn, duplicate, unsafe, and unreviewed content creates no reward.
- Approval reward is unique per rating.
- Feature reward is unique per submission.
- Manual priority cannot bypass safety or wing-verification constraints.
- Previously posted content is never selected again.
- A social outbound tap is not proof of following.
- Raw upload count is never a leaderboard sort key.

## Release gates

Critical and high threats remain release blockers until their automated control tests pass and a reviewer confirms the implementation. Provider-dependent controls additionally require production configuration validation before their completion status can be `VERIFIED`.
