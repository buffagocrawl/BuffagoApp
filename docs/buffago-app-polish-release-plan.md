# BuffaGo polish: compatibility review and release plan

**Current status (2026-10-13):** voting SQL contracts were verified read-only before sequential deployment of wing-jury-vote v2 (verify_jwt=true), wing-jury-reveal v2 (false), and wing-public-gallery v4 (false). Exact source and shared dependencies were verified after each deployment. Final cleanup performed no deployment or production write. See [final branch hygiene](buffago-app-polish-final-hygiene.md) and [deployment receipt](../artifacts/app-polish/release-qa/deployment/production-edge-deployment-final.json). Statements below about undeployed work describe earlier sessions and are historical. Other release gates remain outstanding.

## Current acceptance and deployment decision ? supersedes historical sections below

Detailed evidence, connection instructions, unresolved gates and device card:
[buffago-app-polish-staging-acceptance.md](buffago-app-polish-staging-acceptance.md).
Authoritative executable manifest: [buffago-app-polish-deployment-manifest.json](buffago-app-polish-deployment-manifest.json).

**Overall release NOT READY.** Shared voting/photos passed real local GoTrue,
PostgREST, Storage, worker and independent SQL/three photo-Edge phase acceptance.
The Jalape?o bodyless Storage DELETE header repair passed actual cleanup/retry
and a focused repository regression. Wingman provider success/calibration is
BLOCKED by absent suitable dedicated non-production OpenAI/Places credentials.
No production writes/deployments were performed by this session.

Fresh read-only source inspection finds **Wingman v18**, deployed externally,
byte-identical to current handler/confidence/menu/deadline helpers; do not call
v17 current or redeploy v18 unnecessarily. Deployed atomic limiter/create RPC
bodies remain unchanged from the validated baseline (fresh metadata comparison).
The other seven captured baseline Edge handlers match deployed source content,
with only CRLF/LF/final-newline packaging differences, not exact byte identity.

### Exact remaining production execution manifest

| Order | Path/component | Status |
|---|---|---|
| None | `crawl/supabase/migrations/20261013011230_mango_restaurant_review.sql` | Already deployed, do not replay. |
| None | `artifacts/app-polish/release-qa/deployment/20261013022806_wingman_rate_limit_repair.deployed.sql` | Already deployed evidence only; do not run/reset counters. |
| 1 | `crawl/supabase/proposals/app-polish-vote-conflict-review.sql` | Required read-only fresh drift preflight. |
| 2 | `crawl/supabase/proposals/app-polish-shared-photo-votes.sql` | Only required new SQL; local acceptance passed, production install blocked pending release gates. |
| 3 | `crawl/supabase/functions/wing-jury-vote/index.ts` | Required; JWTtrue, unchanged `_shared/wingJury.ts`, canonical counts/first-verdict protection. |
| 4 | `crawl/supabase/functions/wing-jury-reveal/index.ts` | Required; JWTfalse with retained handler checks/privacy, same helper/counts. |
| 5 | `crawl/supabase/functions/wing-public-gallery/index.ts` | Required; JWTfalse, canonical counts and like/newest/id ordering. |
| Already current | `crawl/supabase/functions/wingman-intake/index.ts` | Already deployed v18; skip redundant deploy. Bundle includes confidence/menu/deadline helpers; provider gate still blocked. |
| 6 | `Agents/Jalapeno/wing_processing_worker/repository.py` | Required worker package update; omit inherited Content-Type on bodyless exact-object DELETE. No worker SQL. |
| 7 | Existing Mango UI/server changes | Release only after isolated HTTP review/history/growth gate; no additional SQL. |
| 8 | Mobile source including separate shared Sort/Filters | After backend availability/distributed-contract/physical gates; no release submitted. |

Optional randomized-feed SQL and quarantined forward Jury foundation remain
excluded/blocked as in the JSON manifest. **Never replay migrations wholesale.**
Local `schema-baseline.sql`, `platform-storage-prerequisites.sql`, routing proxy,
native-main environment override and generated loaders are NOT deployment inputs.
They rebuild the isolated dependency closure/use already-deployed Storage columns
and route real native services without JWT bypass. See source-verification receipts.

Withdrawal decision is resolved: both approved conflicts retain source rows and
have a proven later recorded dislike; no unresolved current Gallery withdrawal.
Missing pre-bridge delete history limits intent for Jury-only pairs; Branden chose
existing Jury verdicts as active shared votes. Both originals remain audit records;
failed-photo history stays excluded. No production reconciliation was performed.

### Remaining gates and owners

- Backend engineer + Branden: dedicated test `OPENAI_API_KEY` and
  `GOOGLE_PLACES_API_KEY` (or `GOOGLE_API_KEY`) in ignored staging-only env;
  actual provider verification/insertion/duplicate/calibration receipts.
- Release/backend engineer: fresh production schema/conflict drift preflight,
  representative migration lock/load timing and explicit data-preserving code
  rollback rehearsal. Forward SQL/each photo-Edge phase already passed.
- Mango/backend engineer: real isolated HTTP review/history and growth snapshot
  after candidate phases; prior full Mango suites remain preserved, not repeated.
- Backend engineer: signed-in anonymous path if distributed clients depend on it;
  local anonymous sign-in disabled. Guest denial and deleted-account denial passed.
- Branden/mobile engineer: actual Play/TestFlight/store/OTA cohort evidence and
  identified QA builds/physical Android + native iPhone receipts. Prior EAS
  completion/submission does not prove distribution. Unknown assignments stay unknown.

Physical checklist (use synthetic users/media and record build/OS/backend):
popup keyboard/retry preservation; shared Sort/Filters + inline swipe/viewer
index; synchronized vote changes/withdrawal; drag/pinch/reset/cancel + stored
crop/primary/thumbnail agreement after retry; status-bar contrast on dismiss and
foreground. Android USB can reverse55321; native iPhone needs reachable isolated
HTTPS signed-URL origin. Existing Metro8086 screenshots use mocked fixtures and
must not be treated as real-service device acceptance. Detailed commands and
expected/evidence outcomes are in the acceptance report. No physical check passed.

Rollback: failed SQL transaction rolls back wholly; successful SQL retains bridge,
neutral votes and dual snapshots. Full reversal needs writer quiescence/current
reconciliation, never stale snapshot restoration. Restore old gallery/Jury sources
with original JWT settings while retaining bridge; v17 Wingman is reviewed
historical rollback only. Worker rollback keeps jobs/receipts, pausing cleanup if
old Storage400 returns. Restore Mango/client builds without deleting records/votes.

Latest UI verification: 19 focused tests passed; lint zero errors/ten existing
screen warnings; typecheck passed after excluding generated local Deno loaders
from mobile tsconfig. Android emulator interactions + seven screenshots passed
under `artifacts/app-polish/release-qa/sort-filters/`; native iPhone/physical Android
outstanding. New UI loads stable full pages before filtering/virtualization and
uses complete rating metadata for saved lists. No new dependency or SQL required.

All work remains unstaged/uncommitted/unpushed; production untouched by this
session. Earlier setup failures and missing-baseline statements below are
historical evidence, superseded by the real acceptance receipts above.


## Historical pre-baseline attempt: blocked before execution

**Backend deployment verdict: NOT READY. Real integrated staging acceptance has not run or passed.** Readiness inspection found a missing validated application schema baseline; acceptance was stopped at that blocker as requested. No broad suites, previous SQL/fixture tests, exports or emulator checks were repeated. No production endpoint, record or secret was used for this attempt.

Exact findings:

- `crawl/supabase/local/app-polish-acceptance/supabase/` contains only `config.toml`; there is no validated baseline SQL or synthetic seed package there.
- CLI status reports `No such container: supabase_db_buffago-polish-acceptance`. The isolated acceptance project is prepared but not running.
- Read-only inspection of the existing `supabase_db_crawl` database (`postgres`) found **zero of seven required app tables** (`destinations`, `wing_media_submissions`, `wing_media_photo_votes`, `wing_jury_votes`, `wing_jury_photo_vote_counts`, `destination_suggestions`, `restaurant_suggestion_reviews`) and **zero of six checked worker RPCs** (`enqueue_wing_processing_backlog`, `claim_wing_processing_job`, `begin_wing_processing_job`, `enqueue_wing_media_cleanup`, `claim_wing_media_cleanup_job`, `finish_wing_media_cleanup_job`). It therefore cannot provide the required app baseline. No existing container/schema/data was changed.
- The preserved PGlite/native-PG fixtures deliberately use reduced synthetic tables; replacing real GoTrue/Storage/worker contracts with those fixtures would not establish staging acceptance.

Evidence: `artifacts/app-polish/release-qa/deployment/staging-acceptance-status-check.log`, `staging-existing-schema-check.log`, and `staging-readiness-blocker.json`. These are read-only setup checks, **not** HTTP/auth/storage/worker acceptance results.

Smallest setup required, owned by the backend/release engineer:

1. Supply one reviewed, schema-only baseline package for the deployed application prerequisites: exact table columns/defaults/constraints/FKs, private helpers, public RPC signatures/bodies, grants/RLS/triggers, private bucket policies, complete upload/finalization/processing/cleanup contracts, and existing Mango/Wingman dependencies. Validate its relevant catalog against deployed definitions without copying users/media/secrets. Include synthetic users/restaurants/photos/votes/reviews separately; no personal production rows. The complete baseline is not currently available. Do not replay the migrations folder or quarantined forward draft to fill the gap.
2. Start the already-prepared separate `buffago-polish-acceptance` stack on API 55321/DB 55322 with newly generated local credentials. Install the validated baseline explicitly; automatic migration/seed replay remains disabled. Supply baseline and candidate Edge bundles deliberately per phase, preserving gateway settings. Run the existing Jalapeno worker against only this target with its documented non-production provider configuration. Do not modify the running `crawl` stack or reviewer.
3. Run real GoTrue/PostgREST/Storage/Edge/worker acceptance using synthetic fixtures: old/new votes and reconciliation, withdrawals/counters/auth/duplicates/cascades, concurrent requests and retries, original/crop/primary/thumbnail bytes, each independent rollout phase and code rollback. Preserve target/build IDs, HTTP/DB/object/job receipts and hashes. No production substitute or mocked-service pass is permitted.

Physical Android/native iPhone remain outstanding after staging is available. Use an actual isolated QA build (none created/distributed yet), record version/build/runtime/update ID and non-production backend target, then capture:

1. Popup entry/retry: keyboard types into visible popup and town/details survive.
2. Inline swipe/viewer + vote/change/withdrawal: correct selected index; vertical scrolling works; Gallery/Jury counts and selected vote converge on refetch.
3. Drag/pinch/reset/cancel/confirm + interrupted upload retry: no blank crop; prepared/uploaded crop and primary/thumbnail agree; consent/attribution retained.
4. Dismissal/foreground: dark status icons on cream modal, light icons on dark app, no stale contrast.

Other release gates remain as documented: actual Play/TestFlight/binary/OTA cohort evidence and representative Wingman confidence calibration. The owner-approved Jury-only policy remains resolved. Git index is empty; all changes remain uncommitted, unpushed and undeployed to production. Existing implementation, original assets and evidence remain preserved.

## Exact deployment manifest and resolved withdrawal review

Authoritative machine-readable manifest: [buffago-app-polish-deployment-manifest.json](buffago-app-polish-deployment-manifest.json). This section supersedes the earlier broad withdrawal-uncertainty gate. **Production deployment is still blocked by staging/device/cohort evidence.** No paid resource or new local service was provisioned. Existing work/evidence is preserved; no full-suite/export/emulator checks were repeated.

### SQL files: exact scope and order

| Execution order | Exact path | Status | Action |
|---|---|---|---|
| None | `crawl/supabase/migrations/20261013011230_mango_restaurant_review.sql` | **Already deployed** | Ledger version 20261013011230 confirmed read-only. Do not replay or reapply for this release. |
| None | `artifacts/app-polish/release-qa/deployment/20261013022806_wingman_rate_limit_repair.deployed.sql` | **Already deployed** | Exact statements captured read-only from deployed ledger version 20261013022806. Evidence/rollback reference only; do not run it or reset counters. |
| 1 | `crawl/supabase/proposals/app-polish-vote-conflict-review.sql` | **Required** | Read-only preflight, not a migration. Check both conflicts and owner-approved Jury-only cohort immediately before installation; stop for unreviewed drift. |
| 2 | `crawl/supabase/proposals/app-polish-shared-photo-votes.sql` | **Blocked; required new SQL** | The **only new production SQL change** in this release. Unapplied proposal: one bounded transaction, dual original snapshots, latest-recorded conflict reconciliation, canonical counts, physical-table bridge and authenticated edit RPC. Deliver these reviewed bytes as one named migration (`app_polish_shared_photo_votes`) through the normal migration mechanism after gates pass; record final ledger identity and SHA. No timestamped migration filename has been invented or promoted. |
| None | `crawl/supabase/local/phase-7b3a/supabase/migrations/20261010192747_wing_jury_saved_destinations_forward.sql` | **Blocked / excluded** | Quarantined prior draft, not a missing prerequisite to replay. Actual Jury objects already exist; its name was not present in the inspected ledger. Stop on catalog mismatch rather than running this broad foundation. |
| None | `crawl/supabase/proposals/android-qa-round-3-randomized-jury-feed.sql` | **Optional / excluded** | Unrelated randomized-feed proposal; not needed or authorized in this polish deployment. |

All other historical migrations, old gallery eligibility SQL, media/worker/RLS prerequisites and growth SQL are **not execution inputs**. Their installed definitions are compatibility preconditions inspected in `production-contract.json`; neither filename similarity nor a quarantined local foundation establishes a missing production migration. There is no additional Mango SQL, rate-limit SQL, crop SQL, photo-worker SQL or growth SQL required for this release. Never replay the migrations folder.

### Four Edge Functions: exact order, sources and protected settings

| Order | Function / source | Update required | Preserve gateway setting |
|---|---|---|---|
| 3 | `wing-jury-vote` — `crawl/supabase/functions/wing-jury-vote/index.ts` | Add shared dislike/neutral counts while retaining first-verdict duplicate protection and authenticated eligibility checks. Bundle unchanged `_shared/wingJury.ts`. | `verify_jwt=true` |
| 4 | `wing-jury-reveal` — `crawl/supabase/functions/wing-jury-reveal/index.ts` | Add shared dislike/neutral counts; preserve committed-user/guest reveal and privacy. Bundle unchanged `_shared/wingJury.ts`. | `verify_jwt=false`; handler checks retained |
| 5 | `wing-public-gallery` — `crawl/supabase/functions/wing-public-gallery/index.ts` | Read canonical shared counts and sort likes descending, newest descending, ID ascending before pagination; preserve approval/consent/signing behavior. | `verify_jwt=false`; public eligibility retained |
| 6 | `wingman-intake` — `crawl/supabase/functions/wingman-intake/index.ts` | Inclusive 0.50 wing threshold, independent verified restaurant/location/match, nullable scores and bounded menu evidence. Bundle `_shared/wingmanConfidence.ts` and `_shared/wingmanMenuEvidence.ts`. | `verify_jwt=true`; exact v17 atomic limiter, JWT/getUser, authorization and duplicate-safe create preserved |

No `wing-jury-feed`, upload/moderation/deletion/worker/growth function deployment is included. Wingman can release independently of voting but is sequenced here for one concrete manifest. Shared helper paths above are under `crawl/supabase/functions/`; bundle them with the handlers, not as separate function deployments. Preserve existing server secrets rather than copying them into app/build artifacts.

### Compatibility gates and rollback at each phase

| Phase | Pass before advancing | Data-preserving rollback |
|---|---|---|
| SQL → Edge | Fresh read-only catalog/eligibility/conflict/cohort preflight; actual staging old Gallery upsert/delete/read plus existing Jury handlers, counts/neutral/auth/duplicates/cascades; snapshot receipts and migration lock/load timings. | A failed SQL transaction rolls back as a whole. After success, retain bridge, widened neutral constraint and **both** audit snapshots. Full SQL reversal requires quiesced writers and reconciliation of current decisions; never overwrite current votes from pre-install snapshots or resurrect deleted users/media. |
| Edge → Mango | Validate SQL-only, then vote-only, reveal and gallery phases with concurrent real HTTP clients and existing uploads/storage/worker behavior. Wingman must retain the deployed service-only limiter/create RPCs and v17 JWT/authorization/atomic behavior. | Restore captured gallery v3 and Jury v1 sources/config under `artifacts/app-polish/release-qa/deployed/`, leaving compatible SQL intact. Restore `wingman-intake-v17.ts` with JWT verification independently. Do not redeploy/reset rate-limit SQL. |
| Mango → mobile | Review queue/history, role/auth and loopback/origin acceptance against synthetic staging records; preserve reviewer processes/environment on 4317/4318 until the normal release launcher switch. | Restore the prior reviewer UI/server build/environment; keep review records, roles and SQL bridge. No Mango rollback migration. |
| Mobile rollout | Confirm actual available binary/OTA contracts, new RPC/metadata availability and physical Android/native iPhone receipts below. Refetch must converge old/new votes; already-open old apps cannot instantly repaint cross-device changes. | Stop rollout or restore prior client via its normal channel without deleting server votes or forcing an invented minimum installed version. Keep backward-compatible server contracts and neutral values. No store or OTA publication here. |

### Withdrawal uncertainty: resolved pairs versus owner policy

Fresh read-only production inspection still shows both source rows for each approved pair, the same times/verdicts, and public eligibility true. Gallery withdrawal is a DELETE; a successful later withdrawal would leave its row absent. A later re-vote/upsert leaves a row whose `updated_at` is validator-stamped. Deployed Jury verdicts cannot be user-withdrawn or edited; only account/media cascades remove them, which do not leave this intact pair. **Therefore the missing withdrawal log does not create an unresolved current withdrawal in either approved conflict.** It cannot overturn their latest surviving recorded actions under the inspected normal client contracts:

- `189f18c1`: later Jury dislike at 19:59:23.129031 UTC; earlier Gallery like at 14:26:26.276510 UTC.
- `f686c20e`: later Gallery dislike at 20:35:35.215217 UTC; earlier Jury like at 20:01:07.666547 UTC.
- `c1c6e647`: failed and currently ineligible; preserve like/neutral history, no public reconciliation.

This establishes stored chronology, not psychological intent, transaction commit order, or a complete user-event audit. Jury `created_at` is not an immutable server-only provenance log; repeated Gallery upserts refresh time. If the owner disputes an actual source timestamp/verdict, that case remains blocked for an individual decision. No such dispute was supplied; the requested latest-recorded-action policy remains the local proposal. Contradictory ties/invalid chronology still abort rather than pick a winner. Both complete source rows remain protected by the existing dual-snapshot proposal; production records were not reconciled.

**Separate cohort decision, supplied by Branden in this session:** “Use existing Jury verdicts as shared active votes.” This applies to the inspected **110 eligible Jury-only pairs across four voters**. Their missing Gallery row cannot distinguish never-voted from withdrawn. The decision explicitly chooses the surviving Jury verdict as active shared state; it does **not** turn missing history into proof of intent. The bridge keeps the original Jury row/timestamp, captures it in the Jury snapshot, records no fabricated original Gallery row, and mirrors the active verdict into Gallery. Neutral remains a real vote, not withdrawal. Failed/withdrawn photos remain excluded. This cohort no longer awaits a policy decision; review unexpected drift at preflight.

Evidence: `artifacts/app-polish/release-qa/deployment/withdrawal-review.json`, `withdrawal-history-test.log`, `jury-only-owner-policy-preflight-test.log`, and `crawl/tests/app-polish-withdrawal-history.test.mjs`. Only new targeted checks ran: deployed pre-bridge delete/re-vote semantics and owner-approved Jury-only neutral/audit/read-only preflight. Prior policy/concurrency/worker suites were not repeated. `deployment/manifest-validation.log` confirms 23 current source/rollback/config/document references and hashes, exactly two ordered SQL inputs, four functions, preserved gateway flags and disabled automatic migration/seed replay. The current release hashes are in `deployment/file-hashes.json`; older candidate manifests remain historical evidence.

### Isolated staging: prepared configuration, minimum setup and cost stop

Fresh project/branch discovery again found only production `vhfxnizaxdanmvmouuaf`, unrelated inactive Signal and default `main` pointing at production. **No existing isolated authorized target is available.** Never reactivate/reuse Signal or `crawl`'s running local containers without a separate authorized scope. Discovery receipts are under `artifacts/app-polish/release-qa/deployment/`.

Prepared file: `crawl/supabase/local/app-polish-acceptance/supabase/config.toml`. Unique local project `buffago-polish-acceptance`; API 55321, DB 55322, shadow DB 55320, optional Studio 55323/mail 55324/analytics 55327/pooler 55329, Edge inspector 55383. All those ports were free at preparation. Real PostgREST/Auth/Storage/Edge are enabled; unnecessary services are disabled. Automatic migration replay and seed are disabled. `supabase status --workdir crawl/supabase/local/app-polish-acceptance` parsed the config and reported **no such acceptance DB container** (`local-staging-config-check.log`), not a running acceptance environment. No credentials, production data, containers, paid project or branch were created.

Minimum remaining setup for the backend/release engineer:

1. Install a reviewed **schema-only baseline** of required deployed media/upload/Jury/review/worker contracts into a separate stack/project, with original RLS/grants and storage policies. Use newly generated local/staging keys, synthetic password-auth users/roles/restaurants/ratings, approved/pending/failed media, votes and review records. Existing reduced PG tests and vote catalog snapshots alone are not a complete worker/storage baseline. Do not copy auth users, photos, source records, SMTP credentials, production URLs/keys or personal data. This missing complete baseline is a concrete setup blocker, not permission to replay every migration.
2. Start the prepared local stack only after baseline/service versions and resource isolation are reviewed, using `supabase start --workdir crawl/supabase/local/app-polish-acceptance`. It creates dedicated project containers/volumes rather than touching `crawl`. No `link`, remote push, production reset, or `db reset` against another workspace. Assert every test/worker URL targets the acceptance host and block production network destinations before writes.
3. Seed private `wing-submissions` objects using synthetic originals/crops and exercise **actual** Storage authorize/upload/sign/expiry/delete, real GoTrue token issuance/refresh and real PostgREST old upsert/delete/read/new RPC. Run current `Agents/Jalapeno/wing_processing_worker_main.py` against only that target with `WING_PROCESSING_ENVIRONMENT=test`, `WING_MODERATION_PROVIDER_MODE=manual-review-test`, `WING_PROCESSING_ALLOW_TEST_PROVIDER=true`, unique worker ID and newly generated staging service key. A local version-1 provider fixture may exercise advisory moderation HTTP; no live moderation provider.
4. Run full worker/upload RPCs, derivative bytes, interrupted upload/job retries, duplicate/finalization protection and concurrent same-/different-user old/new requests. Stage only manifest SQL/functions in isolation and prove each phase independently, plus reviewer/history/growth preservation and rollback. Require request IDs/statuses, DB counts, object hashes, job receipts and target/build identity; no logged secrets. None of these integrated service checks has been claimed passed.

Local option: **$0 added Supabase cloud charge**, using this host/Docker; no cloud provisioning is required, but host resources and device reachability remain to be verified. For physical phones, provide a reachable isolated HTTPS backend or a deliberately configured QA-only LAN endpoint; `127.0.0.1` on a phone is the phone, not this computer.

Paid alternatives, **not provisioned and requiring owner approval before creation**: a Supabase branch is listed at $0.01344/hour (about $0.32 for 24 hours, $2.26 for seven days, $9.68 for 720 hours), plus usage and any required paid plan. An additional Micro project on an existing Pro organization starts around $10/month; a new Pro organization starts at $25/month. Free-project eligibility/current billing plan are unknown, so no free hosted resource is assumed. These are estimates, not a spending commitment; check the creation-screen quote first. Sources: [Supabase pricing](https://supabase.com/pricing), [branch isolation](https://supabase.com/docs/guides/deployment/branching), [local CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started). Stop before any paid provisioning; no approval has been given for it.

### Device acceptance card and remaining owners

**Candidate test builds:** not built/distributed. Mobile engineer must produce an Android QA APK and signed native iPhone QA build from the recorded branch/source hashes, labeled `polish-acceptance`, ideally with separate QA application identifiers to preserve installed store apps. Record actual version/build/runtime/update ID; do not invent an EAS build ID. Backend must be the isolated target above or an approved separate HTTPS staging project, with synthetic users/media. Disable native fixture routing for real-service acceptance; retain feature flags needed for Jury. Earlier emulator fixture builds are not physical or service-integrated sign-off.

| Check on physical Android and native iPhone | Expected outcome | Evidence |
|---|---|---|
| Popup + retry | Keyboard/typing goes to visible popup; input stays positioned and town/details survive retry. | Short recording showing entry/retry plus keyboard screenshot. |
| Inline swipe + viewer + votes/withdrawal | Horizontal swipe preserves vertical scroll and tapped viewer index; Gallery/Jury/old/new refetch shows matching counts/selection after change/withdrawal; guests denied. | Recording plus isolated API/DB vote receipts and actual old/new build identities. |
| Drag/pinch framing + upload/retry | Bounds prevent blanks, reset/cancel work, rotated image handled; confirmed crop equals uploaded bytes and primary/thumbnail; attribution/consent retained. | Frame/preview screenshots, prepared/upload/derivative hashes and worker receipt. |
| Modal dismissal + foreground | Dark status icons on cream modal; light icons on dark app after dismissal/foreground/keyboard transitions. | Before/after screenshots and short transition recording. |

Distribution evidence remains distinct: latest completed EAS Android 1.0.5/code 127 has no EAS submission; code 125's internal-track attempt failed permissions. **Actual Play testing assignments are unknown.** Public US App Store version 1.0.6 is confirmed, while exact storefront build mapping/territories require App Store Connect; latest EAS iOS 1.0.6/build 1.0.3 submission is FINISHED. **TestFlight active groups/builds/expiry are unknown.** EAS OTA inventories returned empty for the inspected project; installed/custom update configuration is unverified. Completed builds or submission success do not establish tester assignment. Prior captured build-controller tests remain valid evidence but do not replace binary/device acceptance.

Remaining actions: **Branden** chooses local versus specifically approved paid staging, supplies Play Console/App Store Connect cohort evidence and completes/assigns the four device checks. **Backend/release engineer** prepares the complete synthetic baseline, runs real service/phase/load/rollback acceptance and refreshes preflight. **Mobile engineer** supplies isolated QA build identities and validates actual available old-client contracts. **Product/release owner** retains the representative confidence-calibration gate. Withdrawal cohort policy has been explicitly decided; any new disputed source/history case or preflight drift still comes back to Branden. No production reconciliation/deployment is authorized by that policy decision.

## Final remaining gates — latest-action policy revision

This section supersedes earlier canonical/Jury-precedence decisions and older distribution findings below. **Not ready for production:** the local reconciliation policy is tested; complete history, real service staging and physical devices still require the evidence listed here. Completed export/emulator/Mango/full-suite checks were not repeated. Wingman v17 and existing Mango work are unchanged.

### Reconciliation policy and evidence

The unapplied `crawl/supabase/proposals/app-polish-shared-photo-votes.sql` now compares validator-stamped Gallery `updated_at` with Jury `created_at`, using PostgreSQL timestamptz comparison at full precision (UTC instants, no display rounding). Only approved **and currently public-eligible** photos belonging to real users are reconciled. The later valid surviving record wins; both complete original rows are captured before any edit in private legacy/Jury snapshots. Snapshots have RLS, no app/service grants and account/media deletion cascades. Reapplication does not overwrite audit originals. Counts remain canonical Jury projections; no second counter was introduced.

| Inspected photo prefix | Latest surviving recorded action | Local proposed result |
|---|---|---|
| 189f18c1 | Jury dislike, October 11 19:59:23.129031 UTC, after Gallery like at 14:26:26.276510 | Dislike in both stores if still eligible; preserve both originals. |
| c1c6e647 | Jury neutral at 19:59:05.979572 after Gallery like at 14:26:46.559983 | Photo is failed: no reconciliation, no public vote/count exposure, preserve both originals. |
| f686c20e | Gallery dislike at 20:35:35.215217 after Jury like at 20:01:07.666547 | Dislike in both stores if still eligible; preserve both originals. |

- Neutral `0` is a valid selected verdict, not withdrawal. Later neutral beats an earlier like/dislike and increments only neutral count.
- A missing row is not a timestamped withdrawal. Pre-bridge Gallery deletes left no tombstone; there is no complete cross-screen event history. We cannot prove an unrecorded withdrawal, infer intent from absence, or safely invent its date. Surviving records alone support a **latest recorded action** proposal, not a claim of complete historical intent. Owner must review this limitation before installation; if intent is disputed, do not install/reconcile those records until independently resolved. No guessed withdrawal was applied.
- Equal timestamps with conflicting votes, missing/nonfinite timestamps, Gallery update before creation or future timestamps abort the whole proposal with `photo_vote_reconciliation_history_requires_review`. Equal timestamps with the same vote are agreement, not a conflict; no arbitrary Gallery/Jury tie-breaker.
- Gallery upserts always refresh `updated_at`, even a repeated selection. Jury rows are immutable in the deployed path, but `created_at` is not a complete trusted event ledger; raw insert permissions and absent edit history limit intent inference. Do not use count-row timestamps or migration-generated mirror timestamps as evidence of an original action. Before SQL installation, rerun the read-only conflict preflight and review drift, eligibility, source authenticity and history gaps. No production reconciliation was performed.
- Once the bridge is installed, accepted old/new changes and withdrawals serialize through the same database transaction; withdrawal removes both active rows and decrements canonical counts. Audit snapshots record initial reconciliation inputs, not an ongoing event log. Failed/withdrawn photos remain excluded by existing eligibility checks and cannot be reactivated by backfill.

New evidence under `artifacts/app-polish/release-qa/acceptance/`: `latest-action-policy-tests.log` has eight passing targeted cases/controller integration; `latest-action-audit-tests.log` has seven passing expanded policy/audit cases (overlapping cases, not 15 independent scenarios). Covers all three inspected shapes with synthetic IDs and actual recorded times, neutral, conflicting/agreeing ties, future chronology, failure exclusion, both snapshots, idempotence, snapshot permissions and deletion cascade. `vote-timestamp-contract-readonly.json` captures the actual deployed validator/trigger timestamp behavior. Disposable native PG17 also passed all three conflict shapes (`latest-action-pg17-tests.log`); the added prior-prototype history guard passed (`prior-prototype-history-guard-tests.log`). Installing over a prior prototype lacking both original snapshots aborts: its mirror timestamps cannot establish intent. Existing original conflict/build/HTTP/worker logs remain preserved. The revised SQL invalidates the earlier candidate hash; use `latest-action-candidate-manifest.json` for the current proposal. No dependencies added.

### Staging availability and exact missing setup

Read-only Supabase discovery returned only BuffaGo production (active) and unrelated Signal (inactive). BuffaGo branch inventory contains only default `main` pointing to the **production ref**; this is not an isolated staging branch. No separate active staging target or credentials were established. Local Docker containers belong to compose/Supabase project `crawl`; they are an existing shared local environment, with no dedicated acceptance volumes/project or running Jalapeno worker/Edge runtime shown. They were not mutated, restarted or used for test writes. Evidence: `staging-project-discovery.json`, `staging-branch-discovery.json`. Browser inventory exposed no authenticated console sessions. Real integrated service checks were therefore **not run**, and production was not used as a substitute.

Backend/release engineer must provide either a separate hosted non-production project/branch or a second isolated local Supabase stack with project ID `buffago-polish-acceptance`, dedicated Docker network/volumes, and nonconflicting ports (for example API 55321, DB 55322, Studio 55323; verify they are free first). Do not reuse `crawl` containers, reviewer ports 4317/4318, Metro or any production secrets. Match the inspected baseline versions: PostgreSQL 17, PostgREST 13.0.5, Storage 1.43.3 and GoTrue 2.188.1, plus a local Edge runtime and current Jalapeno worker.

Required inputs/configuration:

1. A reviewed schema-only baseline matching deployed definitions, extensions, grants/RLS, private helper functions, storage buckets/policies and worker RPCs; seed synthetic auth users, approved/pending/failed media, primary/thumbnail objects, votes, reviews and suggestions. Preserve prerequisite Mango and atomic-limiter schemas. Do not replay the whole historical migration directory blindly or copy production users/media. Existing reduced PG fixtures are insufficient for this gate.
2. Separate staging URL, anon key, service-role key, JWT/signing keys and synthetic user tokens in a local ignored secret file; assert target ref differs from production before any mutation. Block production hosts in test runner/worker environment. Private `wing-submissions` bucket with original/processed synthetic objects and actual Storage API signing/upload/delete endpoints.
3. Stage the SQL bridge and four reviewed Edge handlers in that isolated environment only. Worker `SUPABASE_URL`/service key must point there. Use `WING_PROCESSING_ENVIRONMENT=test`, `WING_MODERATION_PROVIDER_MODE=manual-review-test`, `WING_PROCESSING_ALLOW_TEST_PROVIDER=true` and a unique worker ID, or a dedicated local version-1 moderation HTTP fixture. No live moderation provider. Worker CLI: validate config, then `--once`/bounded `--drain`; exercise retry lease/error paths through real queue RPCs, and cleanup only disposable fixture objects.
4. Capture API/SDK requests and database/object receipts for old Gallery upsert/delete/select and new RPC/Jury endpoint calls, including concurrent actors, same-user races, duplicates, auth/anon/other-user denial, neutral/change/withdrawal, retryable lock conflict, account/media deletion and failed-photo rejection. Verify signed URL expiry/missing objects, consent/attribution, actual cropped upload bytes and resulting primary/thumbnail. Interrupt worker/upload once, retry idempotently, and verify exactly one terminal job/result with no approval bypass. Retain request IDs, statuses, object hashes and final counters, without credentials.
5. Record independent baseline -> SQL-only with old handlers/clients -> each voting Edge handler -> Wingman -> Mango -> mobile phases. At every phase inspect gallery/current vote/counts, pending/review records, growth snapshot, uploads/moderation/deletion and duplicate-safe restaurant creation with synthetic fixtures. Rehearse code rollback retaining bridge/snapshots/neutral votes. Measure migration duration/locks and concurrent HTTP load. A mocked HTTP test or standalone SQL test does not pass this gate.

### Actual distribution access

Fresh [US App Store listing](https://apps.apple.com/us/app/buffago/id6757644594) reports **1.0.6** (the cached 1.0.5 search result is superseded). Public version is confirmed; storefront build number, country rollout and installed cohorts are not. Authenticated read-only EAS submission/build queries associate latest iOS 1.0.6/build `1.0.3` with a FINISHED submission, supporting delivery to Apple but not TestFlight group assignment. The existing build-commit voting contract tests remain evidence; installed binary/OTA configuration is still a gate.

Latest EAS Android 1.0.5/code 127 is a completed build with no associated EAS submission. Code 125 has an ERRORED internal-track submission: `SUBMISSION_SERVICE_ANDROID_SERVICE_ACCOUNT_IS_MISSING_PERMISSIONS`. Play testing active codes/tracks/tester availability remain **unknown**; failed EAS submission does not rule out existing releases or manual uploads. TestFlight active builds, groups, external approval and expiry remain **unknown** without App Store Connect access. No store submission or permission change was attempted.

Authenticated `eas channel:list` and `eas update:list --all` returned empty current pages for project `f08e790e-af47-4fc1-ba5e-707a0a15f7be`. Current app.config.js has no updates URL. Thus no EAS OTA channels/groups were found in this project; this does not establish the embedded/custom-server update configuration of every installed binary. Evidence: `ota-channels.json`, `ota-updates.json`, `eas-submission-build-mapping.json`, `distribution-current.json`; sanitized query source is `crawl/scripts/qa/read-eas-submissions.cjs`. No credential or signed-log URL was saved.

### Remaining gate owners and pass evidence

| Gate | Who completes it | Evidence needed to pass |
|---|---|---|
| Historical intent/reconciliation review | Branden/release owner with backend engineer | Reviewed latest-recorded-action outcomes, explicit acknowledgement or independent resolution of withdrawal/timestamp gaps, fresh preflight rows/eligibility showing no unreviewed drift; no production writes until separately authorized. Local policy tests passed. |
| Real service staging and phase acceptance | Backend/release engineer | Isolated target/secret boundary, baseline schema, real PostgREST/Storage/worker/HTTP concurrent and retry receipts described above, each independent phase plus rollback, preserved review/growth data and lock/load timings. |
| Actual Play/App Store/TestFlight/OTA cohorts | Branden or store account admin; mobile engineer validates contracts | Play Console track/status/code/tester screenshot or read-only API export; App Store Connect live version/build/territories and TestFlight build/group/expiry export; native build/OTA config and observed update ID or embedded launch. Map each actual available voting contract to staging acceptance. No assumed minimum installed version. |
| Physical Android and native iOS acceptance | Branden/device QA | Four checks below, device/OS/build/channel/update ID, screenshots plus short interaction recording; synthetic fixtures and non-production endpoint proof. Existing emulator/export screenshots are retained, not physical sign-off. |
| Confidence calibration | Product/release owner and backend engineer | Representative known menu/location evidence cases below/at/above 0.50, missing/conflicting/no-wings evidence and manual-review outcomes; existing regression tests pass but population calibration is not established. No production restaurant test creation. |

Shortest device checklist — repeat on one **physical Android** and one **native iPhone**, using isolated synthetic fixtures:

1. Open popup from focused Wingdex search, retry once: keyboard/typing belongs to popup, field stays visible and town/details survive.
2. Swipe photos and open selected viewer; change then withdraw vote across detail/Jury and old/new builds: ordered counter/index stays correct, vertical scroll works, counts and selection converge on refetch, guests cannot vote.
3. Drag/pinch rotated synthetic photo, reset/cancel/confirm and retry upload: no blank crop, preview/prepared bytes/primary/thumbnail agree, consent and attribution remain intact.
4. Dismiss framing modal and background/foreground app: dark status icons on cream modal, light icons on dark app, with no stale contrast after keyboard transitions.

Release order remains reviewed **SQL bridge -> vote/reveal/gallery Edge handlers -> independent Wingman + helpers -> Mango -> mobile**, with acceptance between phases. Read-only conflict-review SQL is not a migration. Preferred rollback retains both audit snapshots, compatible bridge, neutral constraint and all current decisions; code rollback can use captured old handlers/v17. Full SQL reversal requires quiesced writers and reconciliation of post-install decisions, never destructive snapshot restoration. No production deployment, staging/commit/push or production record change occurred; original assets and final evidence remain preserved.



**Locally prepared and reviewed; not production-ready.** The mixed-version voting bridge is implemented and tested locally, but remains unapplied. Physical Android, native iOS, representative staging load/HTTP acceptance, and distributed-build inventory remain gates. No SQL, Edge Function, Mango, mobile, or OTA deployment occurred in this task. Work remains on `feature/buffago-app-polish`.



## Actual deployed comparison



Production access was read-only: source/config retrieval and PostgreSQL catalog/aggregate inspection in project `vhfxnizaxdanmvmouuaf`. No production test votes, uploads, restaurant creation, moderation, or other mutations occurred.



Retained evidence in `artifacts/app-polish/release-qa/` includes `production-contract.json` (functions, owners/grants, RLS policies, triggers, constraints), `production-columns-views-ledger.json`, `production-vote-inventory.json`, `deployed-edge-manifest.json`, exact deployed sources under `deployed/`, and `wingman-intake-v17.ts`. The three existing Mango RPC bodies match the local already-deployed migration after whitespace/comment normalization (`mango-compatibility.json`). The deployed ledger records `mango_restaurant_review` version 20261013011230 and `wingman_rate_limit_repair` version 20261013022806; neither migration should be reapplied as part of this release.



The original handoff's local rate-limit baseline was not deployed-v17 evidence. That claim was corrected: the proposal now preserves the exact v17 atomic `wingman_consume_rate_limit` adapter, admin-client setup, `auth.getUser` JWT checks, verified creator identity and service-only `wingman_create_destination` call. The gateway remains `verify_jwt=true`. The deployed rate-limit and creation SQL is unchanged. Isolated PG17 testing admits exactly 10 of 20 simultaneous signed-in requests and 3 of 8 anonymous requests; client execution is denied. Missing/invalid users fail before creation. The creation RPC's table lock, exact-match reuse and ambiguous-address rejection remain intact.



The vote/reveal deployed-handler ASTs match the proposals after removing only added dislike/neutral response properties and expanded count selection. Gallery v3 comparison shows only canonical counts, sorting and additive neutral fields; existing approval/consent/storage/signing logic and response keys remain. Wingman's intended differences are stricter identity/location checks, nullable confidence, retained attributable menu evidence and inclusive 0.50 wing approval with independent >=0.80 restaurant match, verification and ambiguity/contradiction checks. No new approving defaults or confidence floors.



## Compatibility bridge decision



Exact candidate: `crawl/supabase/proposals/app-polish-shared-photo-votes.sql`, **local only**. The previously proposed one-time backfill alone was incompatible with continuing old-client writes. It is now a bidirectional bridge.



The frozen pre-polish client path (`crawl/tests/fixtures/legacy-photo-voting.js`) upserts `wing_media_photo_votes` on `(submission_id,user_id)`, deletes to withdraw, reads its own verdict from that table and reads photo totals from `wing_media_submissions`. The new path uses `set_wing_jury_photo_vote` and reads `wing_jury_votes`. Both physical tables stay in place, so old PostgREST upserts retain their conflict target; a view replacement would break that operation.



SQL contract inventory:



- **One new public RPC:** `set_wing_jury_photo_vote(p_submission_id uuid, p_vote smallint) -> jsonb`, with submission ID, selected vote/null, and like/neutral/dislike counts. EXECUTE is authenticated-only; PUBLIC, anon and service_role cannot invoke it. Ownership, real non-anonymous account existence, consent/approved asset eligibility and authentication are checked. Existing public RPC signatures do not change.

- **Existing tables and RLS:** all vote tables, primary keys, FK cascades, owner policies and client table grants remain. No direct Jury UPDATE/DELETE grant is added. The legacy vote CHECK widens from +/-1 to -1/0/1. Old controls still send +/-1; a mirrored neutral 0 shows neither old Like nor Dislike selected, remains readable, and can be changed/withdrawn normally. Old UI cannot offer the new neutral button.

- **Five new triggers:** actor statement locks on each vote table, a legacy row-lock guard, and AFTER mirrors on each vote table. Existing Jury validation/immutability and legacy count-refresh functions are updated without changing signatures; existing count trigger names and Jury delta-count implementation remain. New private lock/project/mirror helpers have fixed search paths and no app/service EXECUTE privilege.

- **One count authority:** Jury count triggers own totals. Legacy photo counters are a projection of those totals, not a second counting implementation. Inserts/changes/deletes propagate in both directions; nested mirror triggers suppress recursion. A blind Jury duplicate still returns/rejects the existing unique verdict rather than changing it.

- **Ordered locking:** same-account statement lock and auth-user key-share lock precede row updates. Photo rows use exclusive locks to avoid SHARE-to-UPDATE upgrade deadlocks while projecting totals. A legacy row mutation whose media parent is already busy uses NOWAIT and returns retryable PostgreSQL 55P03 rather than deadlocking with media deletion; the previous controller restores its optimistic state and asks for retry. Same-user old/new changes serialize; account/media cascades preserve counts and do not resurrect records. Different users on a busy photo may need retry; this contention behavior needs staging load acceptance.

- **Initial reconciliation:** eligible real-user legacy votes backfill only when a Jury verdict does not already exist; the latest valid recorded Gallery updated_at or Jury created_at wins conflicting eligible verdicts; invalid chronology or contradictory exact ties abort for review. Eligible Jury votes then mirror into legacy, including neutral. Ineligible historical legacy votes remain. Both original vote stores are saved in RLS-protected, app/service-inaccessible `private.photo_vote_bridge_legacy_snapshot` and `private.photo_vote_bridge_jury_snapshot`, with auth-user/media cascade FKs so deletion does not retain personal vote history accidentally. No vote table is dropped or truncated.



Read-only production aggregate at inspection: 9 legacy rows, 8 eligible legacy rows, 122 Jury rows, 3 conflicting pairs, 110 eligible Jury-only rows. Counts are not an installed-version inventory. The three conflicts must receive explicit staging reconciliation review; the snapshot preserves the losing legacy representation. Migration locking is bounded by 5-second lock acquisition and a 60-second statement deadline, with one transaction; test actual volume/duration and schedule a quiet release window. The proposal has not been promoted to a migration or applied.



**Voting minimum version:** no forced upgrade is needed for the inspected legacy upsert/delete/read protocol once the bridge is installed. Stored counts/verdicts converge on refetch. An already-open old app has no new cache subscription, so another device's change cannot instantly repaint that old app's memory. Actual distributed versions remain unknown; an archived released binary must be included in staging HTTP/device acceptance. Do not infer installed versions from repository version strings.



Older Wingman clients keep the request/response keys, but their stricter 0.75 client threshold can still route 0.50 results to review, and null existing-match confidence can change their lookup UX. Server creation remains safe. Full old-build Wingman behavior has not been signed off; retain this release gate rather than invent a numeric minimum version. New polish mobile behavior requires the new vote RPC and Wingman verification metadata first.



## Four Edge Functions and rollout phases



| Function | Actual deployment | Candidate change | Preserve verify_jwt |

| --- | --- | --- | --- |

| wing-public-gallery | v3 | Canonical Jury counts; likes descending, newest descending, ID ascending before pagination; neutral count added. | false |

| wing-jury-vote | v1 | Add dislike/neutral counts; auth, input/eligibility checks and duplicate semantics preserved. | true |

| wing-jury-reveal | v1 | Add dislike/neutral counts; committed-vote/guest-reveal and personal-data restrictions preserved. | false |

| wingman-intake | v17 | Evidence-based nullable scores, inclusive 50% wing policy and strict independent verification; v17 atomic rate limiter/JWT/creation preserved. | true |



Exact source/dependency hashes are in `candidate-manifest.json`. Include Wingman's `_shared/wingmanConfidence.ts` and `_shared/wingmanMenuEvidence.ts` and Jury's existing shared source. The existing Wingman floating SDK import remains unchanged; dependency pinning is a separate review item. No packages/lockfiles were changed.



Future release steps, **not executed**:



1. Complete the physical/iOS checklist and archived-build staging acceptance. Recheck current deployed hashes/config/catalog, the three conflicts, backfill duration and data snapshots; review only this proposal as one new migration. Preserve existing Mango/rate-limit migrations, secrets and roles. Keep all fixture flags disabled in release builds.

2. **SQL first:** install the single reviewed bridge migration in a quiet window. SQL alone supports both clients and deployed gallery/vote/reveal versions: old photo totals are projected and old writes mirrored while Jury v1 keeps unique first-vote behavior. Verify RLS, counts, cascades, pending/media status and review preservation in staging. Refresh/check the PostgREST schema cache for the new RPC. Do not disable legacy voting or revoke its existing grants.

3. **Edge:** deploy vote and reveal additive responses, then gallery canonical ordering/counts. These phases can operate independently after SQL; no forced mobile cutover is required. Deploy Wingman with its shared helpers and verify JWT remains enabled. Wingman can release independently of voting but requires old/new-client confidence UX acceptance and unchanged atomic dependencies. Deploy only these four functions, not feed, media/moderation/delete-account/worker or unrelated growth functions.

4. **Mango:** refresh/restart only its reviewed build through the normal launcher, preserving environment, reviewer identity, loopback/origin protection and history. Existing review/create/pending RPCs and pending view remain compatible. The test origin guard's optional frontend port retains 4317 as the production default. No extra Mango SQL.

5. **Mobile last:** release only after server and device gates pass. EAS uses remote versioning; Expo config 1.0.6/runtime 1.0.4/iOS build 9 and generated Android 1.0.5/code 6 are repository values, not proof of distributed versions. Resolve build numbering through the normal release process. No OTA or store submission here.



## Rollback and preserved areas



Preferred rollback retains the bridge, widened neutral constraint, snapshot, canonical votes/counts and FK cascades. Previous gallery v3 remains compatible because its legacy photo totals are now projections; previous vote/reveal handlers and old mobile voting remain compatible. Rolling back UI/Edge code does not require deleting votes. Wingman can return to the exact saved v17 source/config independently, retaining its atomic limiter and JWT setting.



Full SQL reversal requires quiescing **all** writers, snapshotting both live stores, reconciling post-install edits and keeping neutral verdicts. Restore captured private validation/immutability/legacy count functions and remove bridge/RPC triggers only after retiring dependent clients. Never blindly restore the pre-install snapshot over current decisions, delete backfilled rows, re-narrow the constraint while neutral rows exist, or resurrect deleted accounts/media. No destructive rollback script was run or supplied as an automatic action.



Uploads, moderation and worker function sources are not changed by the bridge. Only photo like/dislike columns are projected; statuses, storage paths, consent, attribution and processing fields are untouched. Real-PG tests serialize votes with media withdrawal/deletion. Upload/framing/moderation regressions remain in the app/worker test suites; no live service/provider acceptance was performed. Local crop bytes and primary/thumbnail match; existing social portrait aspect transformation remains unchanged.



The combined isolated migration fixture contains approved photos, preexisting conflicting votes, a pending photo, pending restaurant suggestion and existing Mango review. Bridge application/reapplication preserves pending status, review receipt and growth integration values. The fixture overlays actual deployed vote functions/RLS/constraints; Mango's existing migration is applied as a synthetic prerequisite, not proposed for production reapplication. Actual growth SQL was inspected and is not changed; the local growth fixture is reduced, so full production-equivalent growth/storage/worker acceptance is still a staging gate. Exports and mocked provider/HTTP tests alone do not establish production safety.



## Final test evidence and cleanup



`artifacts/app-polish/release-qa/final-compatibility-tests.log`: **362 tests, 355 passed, seven skipped, zero failed**. Includes real disposable PG17 old/new races, busy-parent retry, cascade/withdrawal guards, actual old/new controllers against the isolated database, migration/history/growth integration, deployed-handler AST checks, v17 atomic limiter, and previous polish/upload/gallery/Jury regressions. Four deployed-handler/helper semantic checks also pass (`deployed-contract-tests.log`); 48 post-cleanup focused regressions pass (`cleanup-focused-tests.log`). Seven skips are opt-in Deno runs covered separately or intentionally disabled legacy assertions; `edge-runtime.log` records three current Deno/SDK loopback boundary tests passed. `mango-full.log`: all **76 tests** in eight files passed on isolated ports; reviewer processes on 4317/4318 were preserved. Typecheck, Deno check, lint (zero errors, 98 existing warnings) and Android/iOS exports passed; exports are compile checks, not iOS runtime QA.



Status-bar contrast is fixed by one root policy (`AppStatusBar` and `statusBarPolicy`) with modal leases, restoration on dismissal and foreground retries that read current state. Unit/lifecycle checks and Android emulator open/foreground/dismiss/foreground captures passed. `native/statusbar-modal-foreground.png` shows dark icons on cream; `native/statusbar-after-dismissal.png` shows restored light icons on the dark app. Physical/iOS sign-off remains outstanding.



Android pinch/drag uses injected two-pointer events on emulator-5554, not a physical device. Retained confirmed frame/preview, prepared JPEG, crop JSON, primary/thumbnail and verification report show matching framing without network upload. The superseded intermediate pinch screenshot was removed during final cleanup. The local QA APK was uninstalled; its generated binaries were removed, with source retained for reproduction.



Cleanup removed **122 confirmed task-generated paths (1,265,597,452 bytes)**: 11 stopped disposable PG clusters, four temporary Expo export directories, generated gesture APK/class/dex, superseded logs/crop experiments/hierarchies and duplicate captures. `cleanup-manifest.json` and `cleanup-results.json` list every path and reason. Kept 16 representative screenshots, current logs/contracts, implementation/tests/proposal/docs and fixture source assets. Original/tracked app assets, unrelated output/cache folders, restaurant-review artifacts, Mango/growth work, and uncertain ownership files were preserved. Temporary exports/databases mentioned in historical raw logs were deliberately removed after their checks; their source and successful evidence remain.



## Outstanding physical Android/native iOS checklist



Only an Android emulator is connected; this Windows host has no native iOS simulator. None of these device checks is signed off:



- Use isolated fixture/non-production builds; verify the network boundary first. From a focused Wingdex search, check popup keyboard focus/position, rotation/large text and town/details retention across retries.

- Swipe photos, check ordering/counter/empty/single cases and selected viewer index; verify vertical scrolling and vote taps.

- With synthetic landscape, portrait and rotated HEIC fixtures, drag/pinch to bounds, reset/cancel/confirm, check no blank pixels and compare prepared bytes/primary/thumbnail. Exercise consent, attribution and interrupted retry without real uploads.

- On old and new builds, test like/dislike/neutral/change/withdrawal, counts and selected verdict on refetch, guest denial, account switch, double taps/duplicate verdict and retryable busy-parent errors. Never cast production votes.

- Check system-status contrast on open, dismissal, foreground and keyboard/rotation transitions: dark icons on cream Wing Shot; normal light icons on the dark app. Capture platform/build/device and screenshots.



Remaining gates: physical/native iOS acceptance, archived installed-build/protocol inventory, staging real PostgREST/storage/worker and conflict/load acceptance, and representative confidence calibration. No production-readiness claim or numeric forced minimum version is made.



All changes remain unstaged, uncommitted, unpushed and undeployed; Git index is empty.



Design references: [PostgreSQL trigger behavior](https://www.postgresql.org/docs/17/plpgsql-trigger.html), [React Native status-bar ownership](https://reactnative.dev/docs/statusbar).


## Release acceptance update — 2026-10-13

Read-only production inspection and local acceptance evidence are retained under `artifacts/app-polish/release-qa/acceptance/`. No production writes or deployments occurred. Production release remains blocked; isolated SQL/HTTP checks do not establish full staging acceptance.

### Three inspected conflicts and deterministic proposal

All three pairs belong to the same voter; no user email/name was collected. IDs/timestamps are in `conflicts-readonly.json`. Independent gallery and Jury tables permitted contradictory choices. The available rows establish chronology, not the voter's intended final choice; Jury created_at is not a universal edit audit.

| Photo ID prefix | Gallery record (UTC October 11) | Jury record | Current status | Proposed bridge action |
|---|---|---|---|---|
| 189f18c1 | Like, 14:26:26 | Dislike, 19:59:23 | approved | Keep later Jury dislike; preserve both source rows in protected snapshots; mirror dislike if still eligible. |
| c1c6e647 | Like, 14:26:46 | Neutral, 19:59:05 | failed | Preserve both historical records. Do not restore eligibility or reconcile failed media. |
| f686c20e | Dislike, 20:35:35 | Like, 20:01:07 | approved | Revised: use later Gallery dislike and mirror it into Jury; preserve both original source records. |

These are a proposal, not production reconciliation. Status alone does not establish eligibility; rerun `crawl/supabase/proposals/app-polish-vote-conflict-review.sql` (read-only) immediately before installation, compare every pair/timestamp/status/eligibility with the inspected snapshot, and stop for review on drift. The sole executable bridge proposal remains `crawl/supabase/proposals/app-polish-shared-photo-votes.sql`; no second write script or destructive reconciliation was added. Snapshot/FK account/media deletion semantics remain intact. Failed-photo historical divergence is intentional, not an active public count mismatch. Do not silently substitute latest-timestamp reconciliation or backfill failed media.

### Acceptance gates and build evidence

- PASS: focused real disposable PG17 concurrency, existing old/new controller bridge, deployed-source protections and status-bar regressions: 11 tests (`bridge-contract-tests.log`). Includes busy-parent retries, duplicates, authentication and cascades.
- PASS: three synthetic conflict-shape migration tests, including failed-photo archival preservation (`conflict-tests.log`). No production records were loaded into test databases.
- PASS: latest EAS Android/iOS build-commit voting controllers executed against the isolated bridge: one complete contract test each (`android-build-contract-test.log`, `ios-build-contract-test.log`). Covers old upsert/change/withdrawal/neutral projection and new RPC counts/selected votes. Captured sources are read-only `git show` outputs, not extracted/executed installed binaries.
- PASS: three focused Deno/pinned-SDK loopback HTTP tests (`http-focused-tests.log`) for gallery/vote/reveal, including signing expiry and missing assets. Backend is a fixture, not PostgREST or real object storage.
- PASS: 47 Jalapeno photo-processing/worker tests (`worker-tests.log`), synthetic local image bytes and fake repository/provider interfaces, including worker retries. Not a real storage/worker deployment.
- An initial combined HTTP command unintentionally selected unrelated feed/delete-account entries whose compiled artifacts had been cleaned up. It stalled during fixture initialization and was terminated; its incomplete `conflicts-http-tests.log` is retained, not counted as passing. The correctly scoped command above passed.
- BLOCKED: real isolated PostgREST, Storage/Auth, deployed HTTP endpoints, live worker queue/retry integration and concurrent HTTP old/new traffic. Docker now responds and existing `supabase_*_crawl` containers are running, but their data/ownership and staging credentials have not been established for acceptance; they were not mutated, restarted or reused. No isolated full service environment was provisioned here. SQL concurrency and fixture HTTP are separate evidence, not an end-to-end pass. SQL-first/Edge/Mango/mobile phases remain designed and locally covered; full integrated acceptance of each phase remains outstanding.

EAS read-only build inventory (up to 50 records, `eas-build-inventory.json`) identifies latest completed STORE-profile iOS 1.0.6/build 1.0.3, runtime 1.0.4, commit `7830a30d1a574812e68e5f5007b93d985e58da6b`; Android 1.0.5/code 127, commit `c935fdf1d979b73ceb6ee8947016b0eb2546e150`. An older INTERNAL development Android 1.0.1/code 77 also appears. STORE/INTERNAL describe EAS build intent, not confirmed Play track, App Store availability, TestFlight groups, installed versions or OTA state. Store listing requests were inaccessible; no store-console/TestFlight connector was available. Current public/testing distribution and older installed contracts remain UNKNOWN. Do not infer an installed minimum version from repository configuration or these build records. Latest build-commit sources use the legacy physical-table upsert/delete/select contract supported by the bridge; binary and OTA acceptance remains a gate.

### Exact rollout and rollback acceptance

1. Obtain distribution/OTA inventory and isolated staging/device sign-off; review timestamp/history gaps under the latest-recorded-action policy and rerun the read-only conflict preflight. Recheck deployed v17/source hashes, eligibility and backfill/load/lock timings.
2. Apply only the reviewed shared-voting SQL proposal through the normal migration process. The conflict-review SQL is read-only, not a migration. Preserve existing Mango migration and atomic limiter. Check PostgREST schema reload and legacy physical-table grants/RLS; prove SQL-only phase with old clients and deployed Edge handlers before continuing.
3. Deploy `crawl/supabase/functions/wing-jury-vote/index.ts`, then `wing-jury-reveal/index.ts`, then `wing-public-gallery/index.ts`: additive shared counts/selected verdicts and canonical ranking. Each voting Edge phase follows SQL acceptance. Deploy `wingman-intake/index.ts` with `_shared/wingmanConfidence.ts` and `_shared/wingmanMenuEvidence.ts`, retaining verify_jwt=true and exact v17 atomic limiter/auth/create dependencies. Wingman is independent of the voting cutover.
4. Release reviewed Mango build after its normal review/origin/history acceptance, preserving running reviewer state; no additional Mango SQL. Release mobile last with fixture flags disabled, correct remote build numbers and physical/native iOS sign-off. No phase has been deployed during this work.
5. Prefer rollback of client/Mango/Edge code while retaining compatible bridge, votes, neutral constraint and protected snapshot. Wingman rollback uses saved v17 plus JWT configuration. Full bridge reversal requires all writers quiesced, snapshots of both current stores and reconciliation of post-install changes; never restore old snapshots over newer votes, discard neutral decisions or resurrect deleted media/accounts. Existing rollback section supplies permissions/functions to restore; automatic destructive rollback is intentionally absent.

### Short owner device checklist (all outstanding)

Use isolated synthetic fixtures and non-production endpoints; record exact OS/device/build/OTA version. On a physical Android and native iOS device:

- Popup receives keyboard focus; correct positioning and retained town/details across retries, large text and rotation.
- Inline swipe preserves vertical scroll, ranked counter and tapped viewer index; empty/single photos work.
- Drag/pinch bounds, orientation, reset/cancel/confirm; compare preview with prepared upload and primary/thumbnail; interrupted retry retains framing/attribution.
- Actual old/new distributed builds: like/dislike/neutral/change/withdraw, shared counts/selection, guest/account switching, duplicate/double taps and busy-parent retry, without production votes.
- Dark status icons on cream framing modal; light icons after dismissal and foreground/keyboard transitions on dark app.

Previous screenshots, assets, Mango/growth work and final evidence were preserved. No files were removed this turn. New files are the read-only conflict proposal, three-case regression and acceptance evidence; bridge test now optionally accepts a captured build controller. No dependency changes. All changes remain unstaged, uncommitted, unpushed and undeployed.

