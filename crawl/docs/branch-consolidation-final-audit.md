# BuffaGo branch consolidation final audit

Reconciled 2026-10-09 from existing reports and native evidence; updated after safe artifact cleanup. No tests, builds or native interactions were rerun during documentation/cleanup. Capture paths below are historical identifiers: generated evidence was removed after conclusions were recorded.

## Repository and acceptance

Current/target branch: `feat/wingdex-gallery-zoom-voting`; HEAD `f879b9747e932cf7edc4568b2a821d9bb145edbf`. Before documentation edits, Git reported 43 dirty tracked entries and 110 untracked entries across the repository, including unrelated Jalapeno, growth-command-center and deployment-documentation work. Ignored QA outputs are additional. All existing work is preserved uncommitted.

No branch switch, merge, commit, push, EAS submission, deployment, migration application or production write occurred. **Release readiness: BLOCKED.** Documentation reconciliation and safe generated-artifact cleanup are complete within the verified scope; two active logs and an ambiguous export remain protected.

Labels: **PASS** = directly verified within the stated scope; **FIXTURE PASS** = deterministic data/fixtures; **BLOCKED** = unavailable verification; **FAIL** = confirmed unresolved issue. Earlier failed harness attempts are retained but are not current application failures after a documented successful correction.

## Branch reconciliation matrix

| Feature | Expected | Current state | Missing/conflicting | Action/result |
|---|---|---|---|---|
| Historical UI/voting branches | Preserve completed work | `operation-ui-overhaul` and `feature/wingdex-photo-voting` refs absent; prior reflog inspection recorded both at target baseline | Consolidation work is dirty/untracked rather than separate unique commits | PASS inspection; preserve source, no merge |
| Related branches | Recover unique changes | `feat/wingdex-photo-count-gallery` and `feat/journey-add-image` at `c65b0c1`, 25 commits behind | Zero unique commits | PASS inspection; no restoration required |
| Five tabs | Shared visual system and workflows | Existing OperationUI/tokens reused | Prior V2 defects addressed; no parallel styling framework introduced | Local PASS; native FIXTURE PASS within tested layouts |
| Crawls | Route stops, Resume, filters, Maps/details | Route logic retained; joined fixture stops and SDK single-row response repaired | Animated Resume board accessibility idle remains unavailable | Visual FIXTURE PASS; board XML BLOCKED |
| Wingdex gallery | Counts, thumbnail entry, shared viewer | Both ratings routes use shared gallery | Stale asset callbacks and delayed vote-refresh races repaired | 55 focused checks PASS |
| Photo votes | Consistent mutation ownership | `wing_media_photo_votes`; battles separately use `user_wing_battle_votes` | Viewer standalone fallback has a real use case | Local PASS; live persistence BLOCKED |
| Privacy/eligibility | Approved, consented restaurant derivatives | Local handler uses canonical processed/thumbnail paths | Pending SQL whitespace eligibility differed from handler | Local correction PASS; deployed contract BLOCKED |
| Native map/viewer controls | Visible, safe, tappable Close and votes | Viewport/inset sizing retained; undersized controls raised to 44dp | No known defect in verified final captures | FIXTURE PASS; live Google tiles PASS |

**Missing functionality restored:** no historical branch restoration was required. Crawl fixture correctness restored reliable route-stop presentation during Resume QA; this was fixture repair, not replacement business logic. **Duplicate code removed:** none justified. Shared-gallery callers and standalone viewer fallback were retained. No intentional workflow removal or business-calculation change.

## Implementation and visual consistency

Existing UI overhaul and V2 fixes are documented in [V2 report](visual-polish-v2-report.md) and [UI overhaul audit](operation-ui-overhaul-final-audit.md). Historical branch names/build failures in those reports describe their original runs, not the current checkout.

| Screen/area | Completed work and evidence | Result/limit |
|---|---|---|
| Home | Discovery/progress, level/XP/achievements and nearby actions retained; primary rating CTA, wrapping/stacked actions, trophy in normal flow, corrected bottom padding; Find Wings navigation checked | FIXTURE PASS native; live rating completion BLOCKED |
| Crawls | Route Explorer/filter/details/active/completed presentation retained; scalable controls and Maps; Resume fixture resolves existing stop IDs and SDK `.single()` semantics | FIXTURE PASS visual Resume; automated board XML BLOCKED |
| Wingdex | Search, radius/sort, counts/cards, approved-media entry and map access retained; scalable search/header/chips and map safe-area sizing | FIXTURE PASS presentation/radius; Google tiles PASS |
| Social | Feed/Leaderboard/Friends and geographic filters retained; text-only cards omit empty media; QR actions stack on compact/scaled screens, 44dp targets, title wraps, failed activity acknowledgement handled | FIXTURE PASS native; three behavioral tests PASS |
| Journey | Profile/XP/YTD/history/creator/challenges/achievements retained; wrapping statistic rows and scrollable signed-out layout | FIXTURE PASS native; live authenticated history BLOCKED |

All eight top-level combinations (320/360/390/430dp, 100%/130% font scale) were reviewed using actual Android captures. No new top-level clipping or status/bottom-navigation collisions were found in those captures. This does not certify every subpanel/state or that all Crawl board titles are untruncated. Horizontal rails and the next gallery item are intentionally partially visible and scrollable. First-photo invitations use existing eligible rating/history attachment workflows; no new upload flow or stock restaurant imagery was introduced.

### Crawl Resume and map/details closure

- **FIXTURE PASS:** native 320dp/130% Resume shows QA Harbor Wings unlocked and subsequent stops locked in order. `resume-phase/current-device.png` is the authoritative board image. Route subtitle is ellipsized at this width.
- **BLOCKED:** animated board prevents `uiautomator` accessibility idle. Interrupted Resume runs are not automated passes. `returned-crawls.png` shows Android launcher, not a successful return to list.
- **PASS diagnosis:** map/details assertion `Stops did not become hidden` matched underlying `Stops rated`; exact `Stops` heading was absent after dismissal. Exact-node selectors and explicit list-return controls corrected the harness without weakening dismissal checks.
- **FIXTURE PASS:** final `--only=crawls-map-details` native run exited 0 at 320dp/130%. Map Close returns to Crawls; hardware Back from map and details returns to Crawls. Close changed from 194x125px (~41.7dp high) to 194x132px (44dp), bounds `[655,1730][849,1862]`, clear of safe-area/navigation collisions.
- Historical reproduction and successful evidence: `artifacts/consolidation-native/map-details-reproduction/targeted-flows/` and `map-details-fixed/targeted-flows/`, removed after review. Logs implicated no application dismissal error.

## Gallery, voting and native image handling

Gallery/viewer repairs guard obsolete asset callbacks and use shared mutation versions so delayed refreshes cannot overwrite newer counters/selections. Seven executable async regressions cover these races. Native QA then raised viewer Close, gallery Close and vote targets to at least 44dp.

| Check | Result | Actual scope/evidence |
|---|---|---|
| Thumbnail/count/viewer entry | FIXTURE PASS | Final native 320/130 and 390/100 show two fixture photos and correct viewer ordinal |
| Double-tap, zoomed pan, 1x swipe | FIXTURE PASS | Final 320/130 run: zoom/pan stays on selected photo; reset/swipe reaches photo 2; not repeated in 390 layout-only run |
| Viewer/gallery Close and Back, reopen/background | FIXTURE PASS | Full 320/130 assertions; 390/100 layout-only Close/gallery Back and empty state |
| Vote counts/selected state/rejection | FIXTURE PASS | Native 320/130 Like and Dislike rejected by fixture, counters roll back to zero, selected=false, readable error/Retry at 130% |
| Successful toggle/switch/remove and counters | PASS locally | Runtime tests and isolated PGlite; not native/live backend persistence |
| Physical pinch gesture | BLOCKED | Touchscreen `sendevent` permission denied; available automation provides one pointer. Double-tap is not pinch evidence |
| Empty gallery | FIXTURE PASS | Final 390/100 zero-photo restaurant, understandable empty state and Close |
| Layout/safe areas | FIXTURE PASS | Both final sizes: visible safe Close, no observed overlapping vote controls/clipped viewer text; proportional contained images |
| Live authenticated vote persistence | BLOCKED | No safe isolated authenticated backend; fixture writes are denied |

Historical authoritative final-smoke runs: `artifacts/consolidation-native/gallery-final-stable/320-font1.3/` and `/390-font1/`. Their generated captures/results were removed after review. `gallery-final-smoke` recorded the original undersized targets; `gallery-final-fixed` recorded an interrupted Fast Refresh attempt, not a completed pass.

### Deterministic image loading/failure phase

No application defect was reproduced or application code changed in this phase. Opt-in fixtures use a loopback-only Node server and two existing synthetic BuffaGo assets. These represent processed fixture output, not genuine restaurant photography or certification of production approval/consent. Fixture URLs contain no private Storage paths or signed credentials; mutations remain denied.

| Scenario | Result | Evidence/limits |
|---|---|---|
| Successful thumbnails and delayed gallery loading | FIXTURE PASS | Both 320/130 and 390/100: visible native busy indicator while metadata held, thumbnail HTTP 200 after release, spinner clears |
| Delayed full image/loading placeholder | FIXTURE PASS for independent native visual/HTTP evidence | Both sizes: screenshot shows spinner and safe Close while HTTP response held; release yields image 200 and spinner clears |
| Full-loading XML assertion | BLOCKED | Accessibility idle wait outlasts native image timeout. No automated spinner PASS inferred from timeout |
| Full processed-fixture image success | FIXTURE PASS | Both sizes, controlled image response and visible completed image |
| Failed full image 503 / Retry | FIXTURE PASS | Both sizes, readable terminal error, no endless spinner, fresh URL Retry succeeds |
| Expired signed-image simulation 403 / refresh | FIXTURE PASS | Past expiry metadata plus fixture HTTP 403; Retry obtains fresh valid image. Real Supabase signed-URL lifecycle unverified |
| One broken thumbnail beside valid image | FIXTURE PASS | Both sizes: failed first request, successful second thumbnail/viewer, isolated failure and Retry recovery |
| All thumbnails fail | FIXTURE PASS | Both sizes: two delivered 503s, terminal placeholders, no endless spinner; Retry restores images |
| Terminal failure Close/Back | FIXTURE PASS | Explicit 390/100 failed-viewer Close, expired-viewer Back and all-failed-gallery Back; other valid/recovered dismissal checks at both sizes |
| Error privacy/layout | FIXTURE PASS | Both sizes: understandable errors without displayed paths/URLs, no observed clipping/collision; production privacy separate |

Historical authoritative runs under `artifacts/consolidation-native/`: `image-faults-selector-fixed/320-font1.3` (gallery loading), `image-faults-control-fixed/320-font1.3` (full success/failure/retry), `image-faults-thumbnails/320-font1.3` (thumbnail isolation), `image-faults-native-final/390-font1` (complete final fault run), and `image-faults/visual-review.json` (independent screenshot review). Generated evidence was removed after its findings were recorded here. The final 390 result explicitly recorded the XML BLOCKED row. Earlier failed attempts were harness/fixture issues: Paper busy selector, stale HTTP control keepalive, and edge-origin carousel swipe. Corrected bounded checks do not treat idle timeouts as success.

## Native Android and Google Maps

**PASS:** actual Google tiles were visually verified, with pan/zoom, safe Close and Back, for Wingdex at 320dp both scales, 360dp both scales and 390dp/100%. Wider combinations covered layout rather than repeated map interactions. Crawls native Google tiles were also reviewed in historical V2 captures and the final 320/130 map/details run. This is live tile evidence with fixture route/restaurant records, not live authenticated persistence.

**FIXTURE PASS:** fresh Home Find Wings, Social tabs/filters and background/resume checks were completed. The old `targeted-flows/result.json` Crawl failure is superseded only by the focused map/details result, not erased. Captures are Android emulator PNGs/XML, not browser screenshots.

**BLOCKED:** native iOS on the Windows environment, physical multi-touch, isolated authenticated integration and signing/device release validation. Android/iOS JavaScript exports do not prove native iOS behavior.

## Security, privacy and migration findings

| Invariant | Result | Scope/limitation |
|---|---|---|
| Approved, validly consented, undeleted/unwithdrawn media | PASS locally | Handler/eligibility tests; pending SQL trims all 25 JavaScript whitespace characters consistently |
| Restaurant association | PASS source schema | Destination NOT NULL and FK/DELETE RESTRICT; deployed catalog not certified |
| Canonical processed derivatives, no original fallback/path fields | PASS locally | Handler signs processed primary/thumbnail only; contract checks reject mismatched restaurant/submission |
| Authenticated voter ownership/anonymous denial/one effective vote | PASS isolated PGlite | Representative RLS and composite uniqueness; deployed policies not certified |
| Up/down/switch/remove counter transitions | PASS isolated PGlite | Trigger and client compatibility checks; real concurrency separate |
| Real simultaneous PostgreSQL sessions | BLOCKED | PostgreSQL 18 exists, but credentials/isolated database unavailable; Docker engine unavailable |
| Deployed handler, Storage privacy/RLS and strict migration rollout | BLOCKED | Prior read-only migration listing omitted `20261008232910`; deployed source retrieval failed internally. Historical report records older v2 contract/original fallback; no current equivalence certification |

Only the pending local `20261008232910_wing_photo_vote_gallery_eligibility.sql` was corrected; no deployed migration history was changed/applied. Development and production previously shared a backend, so authenticated-looking native QA uses guarded invalid-host fixtures and denied writes. No production acceptance is inferred from local tests or synthetic art.

**FAIL: historical migration integrity.** Two existing suite gates remain: duplicate `20260729200000`, 24 checksum mismatches (20 newline-only, four content differences in creator rewards/notifications/creator surfaces/`20261007000241_image_workflow_rc_regression.sql`) and 17 older unmanifested migrations. No historical SQL, checksum expectation or test was weakened. **BLOCKED:** separate database runtime harness lacks its authoritative baseline contract.

## Automated regression chronology

Results below are existing recorded executions, not reruns during this phase. Focused counts overlap; do not sum them into a new suite total.

| Execution | Result |
|---|---|
| Initial recursive suite | 674 total: 669 passed, 2 historical failures, 3 skipped |
| Latest recorded full suite, before later resumed fixture/touch-target changes | 685 total: 680 passed, same 2 historical failures, 3 skipped; no new failures at that checkpoint |
| UI / gallery / security focused checks | PASS: 46 UI; 55 gallery; 26 security, with one Deno skip |
| Social behavioral repairs | PASS: 3 tests |
| Resume fixture phase | PASS: 9 focused tests, syntax and scoped lint |
| Map/details closing phase | PASS: 4 focused tests, syntax and scoped lint |
| Final gallery touch targets/smoke | PASS: 55 focused tests, TypeScript, scoped lint and syntax after changes |
| Latest image fixture/server phase | PASS: 7 focused tests, scoped lint and syntax; no TypeScript/app changes, prior TypeScript PASS retained |
| Prior full lint / dependencies / quick rating | PASS: zero lint errors, 95 existing warnings; Expo compatibility and quick-rating passed |
| Prior exports | PASS: web and Android/iOS Hermes; Android/iOS repeated after Social/client repairs, not after every subsequent fixture-only change |
| Prior Android debug build | PASS: `:app:assembleDebug`, 33 seconds, 572 tasks/35 executed; no unrelated rebuild during resumed phases |

Maps/navigation/auth/rating/photo/voting automated checks were included in the full suite; live integration remains separately BLOCKED. Three full-suite skips were Deno execution and two legacy rate-limit-copy cases. Earlier gallery readiness totals describe earlier runs, not the latest full-suite baseline.

## Safe artifact cleanup results

**PASS within selected scope:** see [cleanup inventory and dry run](qa-artifact-cleanup-inventory.md). Original inventory: **1,068 files / 229,365,706 bytes**. An active log grew by 188 bytes before the dry run. Removed **1,066 untracked/ignored repository files**: 1,054 generated screenshots/XML/results/logs and 12 source/report copies after permanent preservation. Five exact source copies were placed under `scripts/qa/`; six existing identical counterparts and one reviewed superseding helper cover the other contents. Zero tracked files removed; no fixtures or application assets selected.

Also removed **275 task export files and 13 task logs** from explicitly verified Temp paths. Total original-path removals: **1,354 files / 353,234,364 bytes**, including preserved source copies (not a net disk-space estimate). No recursive broad deletion, process stop, staging or test rerun. Earlier gallery-readiness cleanup of 301 files was a separate historical operation.

**REVIEW left untouched:** `artifacts/consolidation-native/metro-fresh-stderr.log` and `metro-fresh-stdout.log` remain locked by active Metro; `dist/` remains an ambiguous generated export (44 files / 14,712,204 bytes). The recovery snapshot, 12 tracked tournament deliverables, source assets/fixtures/migrations/configuration, native caches and unrelated user files remain protected. No zero-artifact claim. Emulator-side temporary captures were not inventoried or removed.

Markdown evidence links were retired in affected reports, with paths labeled historical and findings preserved. The image-fault launcher recovery reference now points to `scripts/qa/metro-image-fault-fixture.ps1`; historical helpers reside in `scripts/qa/archive/`. Existing narrow `.gitignore` exclusions already cover remaining/regenerated QA outputs, so no ignore changes were needed. Cleanup does not unblock release verification.

Lightweight verification: 602 pre-existing non-document source files match baseline hashes; `git diff --check` passes with existing LF/CRLF conversion warnings. Documentation reference check covers 27 local links in affected reports: zero missing links and zero links to removed evidence. Final Git status: same branch/HEAD, 43 dirty tracked entries, 117 untracked entries, zero tracked deletions; ignored active logs additional. The six added untracked files are preserved source copies and their archive README. No application/test behavior was modified.

## Remaining release requirements

1. Separately review/authorize strict eligibility migration and compatible gallery handler rollout; verify deployed consent/association/RLS/grants/private Storage/canonical derivatives and absence of original exposure. No broad migration push or public-original fallback.
2. Provide an isolated authenticated backend and authorized accounts for real vote persistence, concurrent transitions, withdrawal/expiry, auth/rating/photo/history and crawl persistence.
3. Obtain physical Android pinch evidence and native iOS device/build/safe-area verification. Full-loading XML and Resume-board assertions need an observable automation approach; independent native visual evidence remains separately classified.
4. Reconcile historical migration ledger/deployed bytes and missing baseline through a separately reviewed process.

Evidence conclusions: [persistent handoff](codex-handoff.md), [V2 report](visual-polish-v2-report.md), [gallery readiness](wingdex-gallery-zoom-voting-readiness.md), [rollout review](wingdex-photo-production-rollout.md), [eligibility review](wingdex-photo-vote-eligibility.md), and historical run identifiers above. No production release-readiness claim is made.

## Final branch-hygiene verification - 2026-10-09

**Branch hygiene: PASS for intended BuffaGo changes. Production release remains BLOCKED.** All 117 untracked files are classified below; all 43 modified tracked entries were checked for change scope, conflict markers and credential patterns. No accidental modifications identified within this hygiene review. This is not a repeated implementation/security audit or functional certification. Branch and HEAD remain feat/wingdex-gallery-zoom-voting / f879b9747e932cf7edc4568b2a821d9bb145edbf. No files removed in this final verification; cumulative cleanup stays 1,066 repository files and 288 external temporary files.

- Intended commit scope: 28 modified crawl files, five modified Jalapeno derivative-worker/test files, docs/deployments/migration-status.md, and 78 intended new source/test/migration/documentation/configuration files. The Jalapeno derivative work is required photo-recovery support, not unrelated work. Nine modified growth-command-center files and 39 new growth/backup files remain separate; do not stage them with this feature.
- Remaining generated outputs: ignored crawl/dist (44 files / 14,712,204 bytes), two ignored active Metro logs, 13 untracked growth screenshots and one untracked growth Supabase CLI cache. No generated QA captures/results remain among intended branch changes. Archived scripts, launchers, fixture images/design references and permanent audit documents are intentional source, not disposable outputs. The 12 tracked tournament deliverables remain unrelated/protected.
- dist is conclusively generated Metro web output: metadata.json declares bundler=metro; index.html, one hashed web entry, fonts and hashed images date to 2026-07-29. No source/config/CI dependency on this exact directory found. Existing ignore rules and historical export investigation classify exports as generated deployment artifacts. Task ownership and any external serving/retention need cannot be established; retain as an older unrelated/ambiguous export. It is not required application source and must not be committed.
- Metro 8081 PID 26464 and fixture Metro 8083 PID 51620 are still listening; process command lines confirm Expo development sessions. No process stopped and no active log deletion attempted. The two metro-fresh logs are disposable QA logs once their writer/descendants exit naturally and file handles are released. Recheck process/listener ownership and exact files then; delete only those two literal paths. An open development session must not be stopped just for cleanup.
- Conflicts: git ls-files -u is empty; no conflict markers in changed/new text. No tracked deletions. Redacted credential-pattern scans over all changed/new text found no high-confidence secrets; five assignment candidates are explicit test-secret/fixture-only/local-fixture-only placeholders. The empty production-safety-backup SQL file is preserved and does not establish backup completeness.
- Lightweight checks PASS: git diff --check; git fsck --connectivity-only --no-dangling; changed JSON parses; package/lock direct dependencies agree; all 152 statically referenced relative imports in changed/new JS/TS files resolve. Required viewer/RoutePreview/OperationUI/tokens, derivative worker, 16 new test/fixture files plus fixture ignore configuration, three feature migrations, documentation and retained QA harnesses are present. This pass preserved every changed/new non-report file byte-for-byte; prior cleanup's 602 baseline source-hash result is retained, not rerun.
- Ready for a controlled, explicitly scoped commit and an internal-testing build from a hygiene perspective. Do not use git add . or stage the whole working tree. Internal testing must respect existing fixture guards and isolated-backend requirements; no new build/test result is claimed. No commit, push, switch, merge, deployment, migration application or production operation occurred.
- Production blockers unchanged: deployed gallery/consent/eligibility/RLS/private-storage verification and rollout; isolated authenticated vote persistence/concurrent database sessions and other live flows; physical Android pinch; native iOS/signing/device validation; full-loading XML and animated Resume-board accessibility assertions; historical duplicate migration timestamp, checksum/manifest discrepancies and missing database baseline.

### Complete untracked-file classification (117 files)

- configuration: 3
- intended source: 34
- unrelated work: 25
- generated artifacts: 14
- documentation: 22
- migrations: 3
- tests: 16

| Path (repository-relative) | Classification | Handling |
|---|---|---|
| `.gitattributes` | configuration | Preserve |
| `Agents/Jalapeno/wing_processing_worker/photo_derivatives.py` | intended source | Preserve source/design references/QA harnesses |
| `buffago-growth-command-center/activity.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/artifacts/marketing-missions/mission-details.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/operations-redesign/REPORT.md` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-1280x720.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-1600x900.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/operations-redesign/buffago-growth-800x480.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/connected-1280x720.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/connected-1600x900.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/connected-800x480.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/empty-1280x720.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/empty-1600x900.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/empty-800x480.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/product-pulse/report.md` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/artifacts/redesign/buffago-growth-1280x720.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/redesign/buffago-growth-1600x900.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/redesign/buffago-growth-800x480.png` | generated artifacts | Unrelated growth QA capture; preserve/exclude |
| `buffago-growth-command-center/artifacts/redesign/report.md` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/assets/icon.png` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/assets/wing-user.png` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/missions.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/supabase/.temp/cli-latest` | generated artifacts | Unrelated CLI cache; preserve/exclude |
| `buffago-growth-command-center/supabase/migrations/20261008030949_product_pulse_operations.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/supabase/migrations/20261008130000_growth_command_center_redesign.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/supabase/migrations/20261008165529_growth_wall_activity_weekly_catalog.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/fixtures/deployed_snapshot.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/fixtures/live_buffago_growth_command_center_redesign.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/fixtures/live_get_buffago_growth_os_state.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/fixtures/live_get_buffago_growth_snapshot.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/fixtures/live_wing_media_is_public_status.sql` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/product_pulse.test.mjs` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/test_kiosk.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/test_marketing_score.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/test_missions.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/test_product_pulse.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/test_screenshots.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/test_wall_operations.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/tests/wall_followup.test.mjs` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `buffago-growth-command-center/ui/mission_panel.py` | unrelated work | Growth source/assets/tests/migrations/reports; preserve/exclude |
| `crawl/components/RoutePreview.jsx` | intended source | Preserve source/design references/QA harnesses |
| `crawl/components/WingdexPhotoViewer.jsx` | intended source | Preserve source/design references/QA harnesses |
| `crawl/components/ui/OperationUI.jsx` | intended source | Preserve source/design references/QA harnesses |
| `crawl/design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4 (1).png` | intended source | Preserve source/design references/QA harnesses |
| `crawl/design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4 (2).png` | intended source | Preserve source/design references/QA harnesses |
| `crawl/design-references/2e60084a-21d6-4d45-bc98-bd41a6a481e4.png` | intended source | Preserve source/design references/QA harnesses |
| `crawl/design-references/8afd3fb8-1eda-4186-9dd0-054c410ac873.png` | intended source | Preserve source/design references/QA harnesses |
| `crawl/design-references/d2f0653a-f830-452b-8836-8fe848e2a09f.png` | intended source | Preserve source/design references/QA harnesses |
| `crawl/docs/audit-history/README.md` | documentation | Preserve |
| `crawl/docs/audit-history/android-readiness-20261008.md` | documentation | Preserve |
| `crawl/docs/audit-history/crawls-independent-qa-20261008.md` | documentation | Preserve |
| `crawl/docs/audit-history/ui-independent-qa-20261008.md` | documentation | Preserve |
| `crawl/docs/audit-history/visual-polish-prior-report-20261008.md` | documentation | Preserve |
| `crawl/docs/branch-consolidation-final-audit.md` | documentation | Preserve |
| `crawl/docs/codex-handoff.md` | documentation | Preserve |
| `crawl/docs/local-expo-setup.md` | documentation | Preserve |
| `crawl/docs/operation-ui-overhaul-final-audit.md` | documentation | Preserve |
| `crawl/docs/operation-ui-overhaul-native-readiness.md` | documentation | Preserve |
| `crawl/docs/operation-ui-overhaul-qa.md` | documentation | Preserve |
| `crawl/docs/operation-ui-overhaul-release-readiness.md` | documentation | Preserve |
| `crawl/docs/operation-ui-overhaul.md` | documentation | Preserve |
| `crawl/docs/qa-artifact-cleanup-inventory.md` | documentation | Preserve |
| `crawl/docs/visual-polish-v2-report.md` | documentation | Preserve |
| `crawl/docs/wingdex-gallery-zoom-voting-readiness.md` | documentation | Preserve |
| `crawl/docs/wingdex-photo-backend-review.md` | documentation | Preserve |
| `crawl/docs/wingdex-photo-experience.md` | documentation | Preserve |
| `crawl/docs/wingdex-photo-processing-recovery.md` | documentation | Preserve |
| `crawl/docs/wingdex-photo-production-rollout.md` | documentation | Preserve |
| `crawl/docs/wingdex-photo-vote-eligibility.md` | documentation | Preserve |
| `crawl/lib/routePreview.js` | intended source | Preserve source/design references/QA harnesses |
| `crawl/lib/wingdexPhotos.js` | intended source | Preserve source/design references/QA harnesses |
| `crawl/metro.config.js` | configuration | Preserve |
| `crawl/scripts/native-v2-closure.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/native-visual-approved-photo.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/native-visual-contact-sheet.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/native-visual-interactions.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/native-visual-qa.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/native-visual-sign-in.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/native-wingdex-gallery-qa.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/operation-ui-final-comparison.py` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/operation-ui-visual-qa.py` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/archive/README.md` | documentation | Preserve |
| `crawl/scripts/qa/archive/consolidation-flows-20261009.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/archive/consolidation-gallery-20261009.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/archive/consolidation-matrix-20261009.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/inspect-android-env.cjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/inspect-eas-env.cjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/legacy-five-tabs.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/metro-image-fault-fixture.ps1` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/metro-native-fixture.ps1` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/native-consolidation-flows.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/native-image-faults.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/qa/native-image-server.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/scripts/wing-photo-recovery.mjs` | intended source | Preserve source/design references/QA harnesses |
| `crawl/src/theme/operationTokens.js` | intended source | Preserve source/design references/QA harnesses |
| `crawl/supabase/migrations/20261008171906_wing_photo_derivative_recovery.sql` | migrations | Preserve; no application |
| `crawl/supabase/migrations/20261008184025_wing_photo_receipt_fixed_search_path.sql` | migrations | Preserve; no application |
| `crawl/supabase/migrations/20261008232910_wing_photo_vote_gallery_eligibility.sql` | migrations | Preserve; no application |
| `crawl/tests/crawls-details-render.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/fixtures/native-visual/.gitignore` | configuration | Preserve |
| `crawl/tests/fixtures/native-visual/LocationProvider.jsx` | tests | Preserve fixtures/regressions |
| `crawl/tests/fixtures/native-visual/approvedPhoto.js` | tests | Preserve fixtures/regressions |
| `crawl/tests/fixtures/native-visual/supabase.js` | tests | Preserve fixtures/regressions |
| `crawl/tests/friends-panel-runtime.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/native-image-server.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/native-visual-fixture.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/operation-ui-overhaul.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/route-preview.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wing-photo-derivative-postgres.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wing-photo-recovery-command.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wingdex-gallery-deno.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wingdex-photo-server.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wingdex-photo-viewer.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wingdex-photo-vote-postgres.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/tests/wingdex-photo-voting.test.mjs` | tests | Preserve fixtures/regressions |
| `crawl/types/wingdexPhotos.ts` | intended source | Preserve source/design references/QA harnesses |
| `production-safety-backup/buffago-public-data.sql` | unrelated work | Empty safety-backup file; preserve/exclude, not a verified backup |

### Complete modified tracked-file scope (43 entries)

| Path (repository-relative) | Scope |
|---|---|
| `Agents/Jalapeno/tests/test_wing_processing_repository.py` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `Agents/Jalapeno/tests/test_wing_processing_worker.py` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `Agents/Jalapeno/wing_processing_worker/cli.py` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `Agents/Jalapeno/wing_processing_worker/models.py` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `Agents/Jalapeno/wing_processing_worker/worker.py` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `buffago-growth-command-center/.gitignore` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/README.md` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/app.py` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/data/demo_snapshot.json` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/models.py` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/systemd/start-display.sh` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/ui/components.py` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/ui/dashboard.py` | Unrelated growth work; preserve/exclude |
| `buffago-growth-command-center/ui/theme.py` | Unrelated growth work; preserve/exclude |
| `crawl/.gitignore` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/(tabs)/_layout.tsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/(tabs)/home/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/(tabs)/journey/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/(tabs)/leaderboards/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/(tabs)/ratings/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/(tabs)/routes/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/profile/history/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/app/ratings/index.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/components/FriendsPanel.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/components/ScreenHeader.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/components/WeeklyChallengeStats.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/components/WingdexPhotoGallery.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/components/buffaverse/BuffaverseOverview.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/components/creator/WingCreatorSummaryCard.jsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/lib/platformMap.native.js` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/lib/platformMap.web.js` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/lib/wingdexGallery.js` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/package-lock.json` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/package.json` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/providers/ThemeProvider.tsx` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/supabase/functions/wing-public-gallery/index.ts` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/tests/helpers/mobile-runtime.mjs` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/tests/home/quick-actions-home.test.js` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/tests/home/weekly-mission-home-surface.test.js` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/tests/image-workflow-postgres.test.mjs` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/tests/wingdex-gallery-contract.test.mjs` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `crawl/tests/wingdex-gallery-device.test.mjs` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
| `docs/deployments/migration-status.md` | Intentional BuffaGo UI/gallery/photo-recovery/tests/configuration/deployment documentation; preserve |
