# Current staging acceptance and release gates

**Current status (2026-10-13):** voting SQL contracts were verified read-only before sequential deployment of wing-jury-vote v2 (verify_jwt=true), wing-jury-reveal v2 (false), and wing-public-gallery v4 (false). Exact source and shared dependencies were verified after each deployment. Final cleanup performed no deployment or production write. See [final branch hygiene](buffago-app-polish-final-hygiene.md) and [deployment receipt](../artifacts/app-polish/release-qa/deployment/production-edge-deployment-final.json). Statements below about undeployed work describe earlier sessions and are historical. Other release gates remain outstanding.

This report supersedes the earlier missing-baseline/no-running-stack findings.
Work remains on `feature/buffago-app-polish`; no production deployment or write
was performed by this session. The isolated native Supabase stack is running at
`http://127.0.0.1:55321`, project `buffago-polish-acceptance`. Existing crawl and
Mango services, prior app work, original assets and evidence were preserved.

## Backend readiness by component

| Component | Verdict | Evidence / remaining condition |
|---|---|---|
| Shared voting and photo changes | **Real local acceptance passed; candidate for deployment, not unconditional release clearance** | Old/new PostgREST contracts, independent SQL/three photo-Edge phases, authenticated withdrawals/change/neutral/counts, concurrency, duplicate/auth protections, audit reconciliation, account/media cascades, real upload/worker derivatives and retries passed. Refresh production preflight; load/lock timing and explicit rollback rehearsal remain incomplete. |
| Jalapeño worker header fix | **Focused regression passed; ready for worker-package review/release** | Exact-object bodyless Storage DELETE removes inherited JSON Content-Type; service authentication, path, timeout and settlement remain. Actual Storage cleanup succeeded after local failed-job recovery; original deleted, derivatives retained, retry `NO_JOB`. One focused repository test passed. |
| Wingman | **Provider acceptance BLOCKED** | Invalid JWT401, configured missing-key500 and actual service-only atomic signed/anonymous limiter concurrency passed. These do not establish successful verification/insertion or score calibration. No suitable dedicated test provider credentials available. Fresh read-only production inspection finds v18 already matching local candidate exactly; v17 is historical protected baseline. No redundant deployment required. |

The overall release is **NOT READY** until the unresolved gates below pass.
Completed broad suites, exports and previous emulator flows were not replayed
to replace real service acceptance.

## What actually ran

The supplied four-table DDL was supplemented with read-only deployed schema
metadata, not production rows/secrets: 56 application tables, 92 functions,
76 policies, 46 triggers and one enum. Before fixtures, 56 table definitions,
constraints/defaults/RLS and 88 function bodies matched. After bridge install,
the nonmutating audit matched 89 unchanged function bodies, 76 policies and
56 table ACLs; three private voting bodies intentionally changed. Four extra
actual RPC definitions supply rating summary and photo claim/begin/settle.
Auth/Storage/platform schemas came from the native local stack; no production
auth users or objects were copied.

All target writes used synthetic users, restaurants, photos, votes and jobs.
Real GoTrue JWTs, PostgREST, private Storage and native Edge handlers were used.
Receipt files live in `artifacts/app-polish/release-qa/deployment/`:

- `staging-voting-acceptance.json`: seven gates; C1/C3 latest-recorded dislikes,
  both original audit rows preserved; failed C2 archival like/neutral excluded;
  owner-approved Jury-only neutral becomes shared selected vote. Old physical
  table upsert/delete and new RPC converge; six same-user concurrent rounds
  preserve one verdict and exact totals, with supported busy-parent retries.
- `staging-edge-phase-acceptance.json`: vote-only retains old reveal/gallery,
  then reveal and gallery switch independently. Candidate gallery uses canonical
  counts/ranking and excludes failed photos. Wingman's limited fail-closed and
  atomic-limiter tests are explicitly narrower than provider acceptance.
- `staging-upload-acceptance.json`: deployed authorize/validate/promote handlers,
  real signed PUT, persisted SHA/dimensions, reservation/finalization retry,
  and stored original byte-identical to confirmed framing fixture.
- `staging-real-worker.log`, `staging-storage-cascade-acceptance.json`: scoped
  actual photo worker in **manual-review** mode; expired lease reclaimed on
  attempt2, one succeeded event among five audit events, in-review submission
  remains unvotable. Real signed URL expiry, guest-original denial, GoTrue
  account deletion, stale-token vote denial, media/count/audit cascades passed.
- `staging-cleanup-initial-failure.json`, `staging-cleanup-acceptance.json`:
  initial Storage400 `FST_ERR_CTP_EMPTY_JSON_BODY` repaired; only the synthetic
  object/job was restored/reopened for the real worker regression. This is a
  test recovery, not permission to retry terminal production jobs blindly.
- `staging-derivative-agreement.json`: actual downloaded original533×533,
  primary533×533 and thumbnail512×512; mean channel errors0.7244/1.1874 versus
  resized confirmed original. Uploaded SHA matches emulator-confirmed crop.
  This proves fixture upload/processing agreement, not physical pinch gestures.
- `schema-baseline-validation.json`, `staging-catalog-completeness.json`,
  `baseline-edge-source-verification.json`: schema/source provenance receipts.

## Baseline source verification and exclusions

Fresh read-only capture is
`crawl/supabase/local/app-polish-acceptance/baseline/edge/fresh-deployed-source-capture.json`.
Captured galleryv3, Jury vote/revealv1, stage-authorizev13, validate/promotev14
and staging-cleanupv9 match deployed **source content**. Files differ only by
CRLF/LF or final newline; both hashes are recorded, so byte identity is not
claimed. Wingmanv18 handler, confidence/menu/deadline helpers are byte-identical
to current local sources. Its deployment occurred outside this session.

Local-only adaptations, **never production deployment inputs**:

1. `baseline/schema-baseline.sql` recreates only the isolated dependency closure;
   `platform-storage-prerequisites.sql` adds already-deployed `archived_at`
   and `is_delete_marker` columns absent in the local Storage version.
2. `app-polish-local-api-proxy.ts` transparently forwards loopback55321 to actual
   Kong8000. `app-polish-runtime-routing.py` adds one SUPABASE_URL environment
   configuration line to native runtime main and sets own Kong function
   upstream8082. Native gateway JWT logic is unchanged. Original internal HTTP
   Kong signed URLs fail existing Jury URL guards; loopback makes them reachable.
3. Generated handler loaders/runtime copies and ignored local credentials are
   staging machinery. Initial old-gallery signed URL transport mapped only the
   internal host to the published port, preserving the actual Storage token;
   later old-Jury and candidate receipts use native loopback routing.

The worker header fix is a real source change, distinct from these adaptations.
No additional package dependency or production SQL is needed for the fix.

## Exact eventual deployment sequence and rollback

The JSON manifest is authoritative. Do not replay the migrations folder.

| Order | File / component | Status and action |
|---|---|---|
| Existing | `crawl/supabase/migrations/20261013011230_mango_restaurant_review.sql` | Already deployed; do not replay. |
| Existing | `artifacts/app-polish/release-qa/deployment/20261013022806_wingman_rate_limit_repair.deployed.sql` | Already deployed evidence; never reset/replay atomic limiter. |
| 1 | `crawl/supabase/proposals/app-polish-vote-conflict-review.sql` | Required read-only fresh drift preflight; no writes. |
| 2 | `crawl/supabase/proposals/app-polish-shared-photo-votes.sql` | Only required new production SQL. Real local application passed; production install blocked pending release gates. Dual original snapshots/latest-recorded reconciliation, neutral bridge, authenticated edit RPC. |
| 3 | `crawl/supabase/functions/wing-jury-vote/index.ts` | Required; `verify_jwt=true`; shared counts, existing first-verdict protection; bundle `_shared/wingJury.ts`. |
| 4 | `crawl/supabase/functions/wing-jury-reveal/index.ts` | Required; `verify_jwt=false`, handler auth/privacy retained; canonical dislike/neutral counts, same shared helper. |
| 5 | `crawl/supabase/functions/wing-public-gallery/index.ts` | Required; `verify_jwt=false`; canonical counts and like/newest/id ordering. |
| Current | `crawl/supabase/functions/wingman-intake/index.ts` | **Already deployed v18, skip redundant deployment.** Includes `_shared/wingmanConfidence.ts`, `wingmanMenuEvidence.ts`, `wingmanDeadline.ts`. Preserve JWTtrue, atomic limiter, getUser/authorization and duplicate-safe create. Provider gate still blocked. |
| 6 | `Agents/Jalapeno/wing_processing_worker/repository.py` | Required worker package update: bodyless DELETE header fix; no worker SQL. Can roll out independently. |
| 7 | Existing Mango UI/server changes | Normal reviewer release after its real staging review/history/growth gate; no extra SQL. |
| 8 | Mobile client including shared Sort/Filters | After backend availability and physical/distributed-contract gates; no store/OTA publication performed. |

SQL failure rolls back its bounded transaction. After success, retain bridge,
neutral values and both audit snapshots; do not restore stale votes or undo
account/media deletion. Full SQL reversal requires quiesced writers and a
reviewed current-state reconciliation. Edge rollback restores captured old
gallery/Jury sources and original JWT flags while retaining SQL; Wingmanv17
is historical emergency rollback, losing v18 deadline/scoring changes and
requiring explicit review. Worker rollback restores prior package, keeps jobs/
receipts and pauses affected cleanup if the empty-JSON failure returns. Mango
rollback restores its prior build/environment, preserving records. Mobile
rollback stops/restores its channel while keeping compatible server contracts.

## Incomplete / blocked gates and owners

| Gate | State | Owner / evidence needed |
|---|---|---|
| Provider-backed Wingman verification/insertion, lower/equal/higher0.50, missing/conflicting evidence, duplicate creation | **Blocked**; only prior deterministic score tests and real fail-closed/limiter checks passed | Backend engineer + Branden: dedicated keys below; actual isolated HTTP/provider/DB receipts and calibration cases. No synthetic provider response substitute. |
| Real Mango HTTP review/history and growth snapshot after SQL/Edge phases | **Incomplete**; earlier Mango suites passed, not repeated | Reviewer/backend engineer: isolated authenticated role/origin/review/history/growth receipts. Preserve reviewer4317/4318. |
| Explicit code rollback rehearsal and production-sized lock/load timings | **Incomplete** | Release/backend engineer: rollback-to-old handler/client receipts without data loss, bounded migration timing/lock evidence on representative synthetic size. Independent forward photo phases already passed. |
| Staging-cleanup Edge disposable-object/idempotence endpoint | **PASS** | `staging-cleanup-endpoint-acceptance.json`: real deployed source, guest401/ownership403, owned deletion200 and missing-object retry200. |
| Signed-in anonymous-auth user path | **Not exercised**; local anonymous sign-in disabled; guest denial passed | Backend engineer: enable only isolated anonymous sign-in if supported cohort uses it, verify identity/eligibility/authorization contracts. |
| Distributed old binaries/OTA cohorts | **Unknown assignments** | Branden/mobile release engineer: Play tracks/codes, App Store build and TestFlight groups/expiry/update-runtime associations. Completed EAS builds/submissions do not prove tester/store distribution. |
| Physical Android and native iPhone | **Outstanding** | Branden/mobile engineer: identified QA builds against isolated reachable target, recordings/screenshots/object receipts below. |

No remaining voting/upload/derivative/worker regression is known failed after
the header repair. Initial Unicode baseline/index and policy-role serialization
setup failures were corrected before fixtures; missing photo RPC/cache and
Deadline-helper boot failures were corrected before final receipts. Initial
expired synthetic JWT was renewed through real GoTrue. These earlier failed
logs are preserved; they are not current passing claims. The native UI script
hit a uiautomator137 interruption; only unfinished reset was resumed and passed.

### Provider credential setup

No suitable dedicated test credentials were found in the process environment
or the explicit ignored staging provider file. Do not repurpose unclassified
repository keys or copy production Supabase/provider secrets. Backend engineer
must supply `crawl/.expo/app-polish-provider-test.env` containing a separate
non-production `OPENAI_API_KEY` authorized for configured `OPENAI_MODEL`
(source default `gpt-4.1-mini`) and a separate `GOOGLE_PLACES_API_KEY` (or
`GOOGLE_API_KEY`) permitting the handler's server-side Places Text Search and
Place Details. Configure billing/quotas and allow approved external public-menu
reads; provider calls may incur charges. Only generated **local** Supabase keys
are used by the runtime. Serve the acceptance namespace with `--env-file` and
restore its local routing after watcher recreation. Never expose key values
in logs, EXPO_PUBLIC variables, screenshots or committed files.

Use actual provider evidence with a controlled test corpus; insertion targets
only the isolated database and synthetic test account. Do not submit live
moderation or provider writes. Missing keys500 proves fail-closed behavior only.

## Staging connection and shortest device checklist

Host tools: target `http://127.0.0.1:55321`; local generated credentials in
ignored `crawl/.expo/app-polish-acceptance-local-credentials.json`. Surviving
synthetic login sessions can be renewed with the refresh-auth script. Do not
reseed: the account/media cascade fixtures were deliberately deleted. Never
point QA client/worker at production.

Physical Android over USB: select its serial, run
`adb -s <serial> reverse tcp:55321 tcp:55321` and, for a local development client,
`adb -s <serial> reverse tcp:8086 tcp:8086`. Use an **actual QA build from this
branch**, local anon key and localhost55321 backend; signed loopback URLs then
reach this host. Existing Metro8086 is a **mocked visual-fixture bundle**;
create a separate real-service Metro with all native-fixture flags OFF for
staging acceptance. Record which mode is being tested; never call fixture UI
a real backend/device pass.

Native iPhone: supply a development/ad-hoc/TestFlight QA build with a separate
identifier and a reachable isolated HTTPS backend origin. A trusted development
HTTPS reverse proxy can route that origin to this stack's55321; configure only
the local Edge runtime's SUPABASE_URL/public signed URL origin to that same
reachable HTTPS hostname and verify certificate/sign/download from the phone.
Keep native JWT/auth code and local keys; do not ship loopback or routing
adapters. Local host loopback alone is not an iPhone staging endpoint. No
reachable iPhone target or QA distribution is currently configured.

For **each** physical Android/native iPhone, record device/OS, binary version/
build, runtime/update ID, branch source hash and backend origin, then:

1. **Popup + retry:** keyboard immediately types in town/details; retry retains
   both values and popup remains positioned above keyboard. Record short video.
2. **Collections/photos:** separate Sort/Filters; shared choices survive all
   three tabs, clear/reset recover correct saved collection; inline horizontal
   swipe preserves vertical scroll and tapping opens that viewer index.
3. **Votes:** like/dislike/neutral change and withdrawal converge selected vote
   and counts across Gallery/detail/Jury after refetch, including old client;
   use only synthetic staging photos/users. Capture screen and DB receipts.
4. **Framing/upload:** drag/pinch stays covered, reset/cancel work; confirmed
   crop, stored original, primary and thumbnail agree after retry. Capture
   gesture recording and downloaded-object hashes/dimensions.
5. **Status bar:** cream modal has dark icons; dismiss/background/foreground
   restores light icons on dark app. Capture before/after screenshots.

Prior Android injected-pinch/emulator evidence is preserved; no physical Android
or native iPhone check was performed here. Prior EAS completion/submission
metadata remains evidence only: US App Store version1.0.6 known; precise
storefront build/installed cohort unknown. Latest iOS EAS submission FINISHED
does not confirm TestFlight assignment; Android completed code127 does not
prove Play distribution; code125 submission failed permissions. Actual Play/
TestFlight/OTA assignments remain unknown.

## Latest focused Wingdex UI change

Existing default Score/5-mile radius and all Near/Votes/Photos/My ratings/tag/
state/radius options remain. Sort and Filters now have separate dialogs; one
selection and one collection predicate/comparator serves all three tabs.
Saved rows use full rating metadata rather than zero-count placeholders.
Active selections, Clear filters and Reset all are visible; filtered-empty
messages never imply missing favorites/saves. Stable paging loads full ratings,
destinations and saved lists before filtering/FlatList virtualization.

19 focused collection/saved-service tests passed, including >1,200 rows,
tab wiring, empty/reset, personal score/radius and pagination/cancellation.
Scoped lint: zero errors, ten existing screen warnings. Mobile typecheck passed
after excluding only generated local Deno loaders from tsconfig (their .ts
imports are valid in the real Edge runtime, outside the mobile build).
Android API36.1 emulator
interaction and seven screenshots passed; physical/iOS UI remains outstanding.
Screenshots: `artifacts/app-polish/release-qa/sort-filters/` (`discover-controls`,
`sort-options`, `filter-options`, `favorites-shared-filters`,
`want-to-try-filtered-empty`, `want-to-try-cleared`, `favorites-reset-defaults`).
The screenshot UI backend is explicitly synthetic `native-fixture.invalid`.

No file deletion, dependency addition or original-asset cleanup was performed.
Generated runtime duplicates are ignored; original/failure/final evidence stays.
