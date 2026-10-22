# Onboarding V2 release-readiness QA — 2026-10-21

Status: **BLOCKED FOR RELEASE**. Code is available for internal QA; native journey, external OAuth/email and real standalone upload gates remain unverified. No device journey, backend upload, public photo, coin award or XP award is claimed.

## Starting state and scope

Branch: feature/onboarding-v2-simplified-first-value. Starting HEAD: 984e7555386dc375287e5097b1db0ec1077695cc; tree clean. Inspected 35d8227..HEAD and existing docs, V2, flag configuration, gate, preview persistence, auth screens/callback/provider, upload route/composer/Flow, contract migrations and relevant test helpers/suites. No branch reset, rebuild, merge, push, deployment, migration or production request/write. Legacy onboarding and shared sliders unchanged. Existing local container services were auto-started when Docker Desktop was started; no container/schema was recreated.

## Actual implementation

Public invitation uses a new opt-in through the existing config/features.ts parseBooleanFlag pattern: EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE. It defaults false. No existing public photo-availability contract was found. Sessionless/anonymous guests never call the authenticated RPC for invitation rendering or clicking. True is a release owner's assertion that this environment supports the signup incentive, not upload authorization; copy discloses a later availability check. False/unconfigured uses favorites/journey signup benefits instead. Authenticated offer and uploader still enforce server prompt/photo flags; no release flag grants upload rights. V2 defaults false and no environment/deployment configuration was edited.

The version-2 intent retains the existing purpose-specific key, expires after 30 minutes and holds only bounded destination/name context, timestamp, generated handoff identifier, status and optional verified account binding. Version-1 stale intents safely expire rather than auto-upgrade. Serialized claims verify getUser, bind to that account, route at most once per process, and retain disk state until the uploader resolves the destination or deliberately falls back to the picker. A fresh process can resume an interrupted routed handoff within expiry. Submit validates handoff identifier/account from storage, uses stored destination rather than tampered route fields, rechecks current account after flags, and unmounts the uploader on account loss/change. Sign-out/account switching clears the pending action through AuthProvider. Explicit Cancel/Explore clears it; OAuth provider cancel/failure retains it for retry. Hardware/iOS navigation still requires device validation. After acknowledgment it cannot replay from storage. The optional display label is never evidence of restaurant identity.

Login's session listener defers to an active OAuth flow, so it cannot race the callback to Home. Signup and social buttons have synchronous duplicate-tap guards. Verification failures allow another attempt. Both top-level and nested V2/local-only seeds are excluded from legacy replay. Callback return paths allow only established Home, user/account, login routes; external/parameterized/unrecognized paths are rejected. Saved-destination and account-linking precedence remains. OAuth PKCE/exchange implementation is reused. Callback diagnostics no longer contain raw callback URLs or credential fragments. Reset screens are unchanged.

Composer preselects only an RLS-resolved canonical UUID, shows the returned readable name inside the modal and offers Change restaurant (using Flow reset/cleanup). Missing/inaccessible IDs use the picker; failed lookup uses a searchable picker and notice. Explicit picker action remains required for media/permissions. Flow standalone headings and error copy no longer claim a rating was saved. All actual upload, drafts, validation, consent, attribution, quota, moderation and idempotency paths remain existing code. No preview ID is passed as a rating. There is no authoritative closure field in this destination model: independently detecting a closed-but-still-visible row remains P1 unresolved.

## Scenario matrix

PASS here means the stated deterministic layer only. It does not imply native layout, provider/network behavior or deployed backend acceptance. All BLOCKED rows are release gates where noted.

| Scenario | Result | Evidence / limit |
| --- | --- | --- |
| Fresh guest V2 welcome, Explore without rating/account | PASS — component | onboarding-v2; route calls/completion keys and absent preview |
| Existing search → shared rating → actual overall score/local preview | PASS — component | onboarding-v2; persisted score/payload and same dialog |
| Wingman canonical existing/new UUID → shared rating | PASS — component/contract | onboarding-v2, Wingman suites; external provider verification not exercised |
| Wingman queued/unverified/pseudo restaurant, manual review → search/Explore | PASS — component/contract | onboarding-v2, Wingman suites; guest durable suggestion |
| Wingman external verification success/retry/timeout/cancel on device | BLOCKED | No live provider/device session; local gateway unavailable |
| Shared sliders, taps/drags/RTL/accessibility, edit/back/forward | PASS — deterministic | quick-rating + onboarding-v2; native gesture feel/layout not established |
| Preview write failure and cold-mount recovery | PASS — component | onboarding-v2 |
| Crawls absent; V2 flag-off legacy routing preserved | PASS — deterministic/static | onboarding-v2 routing and unchanged legacy component |
| Guest/unknown availability with public release opt-in | PASS — component | zero flag RPC calls for render and CTA |
| Explicit public disable/unconfigured → neutral account benefit + Explore | PASS — component/config | release flag mock false; default false in config |
| Authenticated flag network failure/slow/partial response | PASS — route/helper | onboarding-wing-shot-route; timeout/error fail closed + retry |
| Invite true → server flags disabled before uploader | PASS — route | no composer, truthful unavailable and Explore; retry succeeds when enabled |
| Email immediate-session signup → original destination uploader route | PASS — mocked component | actual login component, actual intent helper |
| Existing password signin → original destination; wrong-password retry | PASS — mocked component | actual login component; intent retained |
| Confirmation-required signup, cold restart, later signin | PASS — mocked component | no-session signup makes no route; persisted intent reused by fresh login runtime |
| Signup double tap, concurrent handoff claims | PASS — mocked component/helper | one signup invocation / one navigation claim |
| Google login session listener does not steal OAuth route | PASS — mocked component | actual login + executeSocialAuth; callback/cancel/error |
| Facebook login session listener does not steal OAuth route | PASS — mocked component | same, both providers |
| Google/Facebook callback deep-link code exchange → same destination | PASS — mocked component | actual callback with mock Supabase/Linking; not external OAuth |
| Callback malicious URL/route and saved-destination precedence | PASS — mocked component | allowlist rejection + saved route priority |
| External Google/Facebook PKCE/browser success/cancel/retry/timeouts | BLOCKED | Provider round trips and deep-link OS delivery not exercised |
| Real email signup/confirmation delivery and delayed link | BLOCKED | No usable authorized QA backend/mail session |
| Already signed-in direct photo route | PASS — helper/route | verified claim and authenticated submit route; no account screen required by code |
| Intent expiry, stale screen, interrupted routed process/restart | PASS — helper | bounded expiry, one-process navigation and post-resolution acknowledgment |
| Logout/account switch, forged handoff and mismatched account | PASS — helper/route | boundary cleanup, stored identity verification, composer removed on loss |
| Normal login without intent → Home | PASS — mocked component | actual login |
| Verified destination preselected; missing/pseudo/network context → picker | PASS — component | actual composer, RLS transport mocked |
| Readable name and Change restaurant; no automatic picker/permissions | PASS — component | real Flow runtime action; composer props verified |
| Standalone source=onboarding, null rating ID, real backend submission | BLOCKED — P0 | latest local SQL permits null ID; no actual authorized upload accepted |
| Consent/attribution, validation, draft restart, duplicate picker/continue, cancel | PASS — mocked runtime/contract | image-workflow-mobile-runtime, Wing Shot suites; no live storage/server |
| Actual camera/library permission dialogs, invalid file, upload/retry/rate limit | BLOCKED — device/backend | static/helper coverage is not native/media/network proof |
| Accepted-for-review, private storage/account/destination, no orphan/duplicate records | BLOCKED — P0 backend | no real submission performed |
| Preview never automatically imported, including wrapped legacy payload | PASS — mocked component/static | signup/signin tests track zero rating transaction calls; callback guards retained |
| New analytics source/destination and no email/media payload | PASS — source/component | bounded intent and source metadata; no raw callback/credential diagnostic fragments |
| Android short/tall/large-text/keyboard/RTL/TalkBack/contrast/back/restart | BLOCKED — P0 device | AVD booted, current bundle did not load; timeout then ANR screenshots |
| Small iPhone/iOS/VoiceOver/device screenshots | BLOCKED — P0 device | Windows host, no xcrun/iOS runtime |

## Commands and actual results

From crawl (PowerShell wildcard expansion is explicit):

- `$files = Get-ChildItem tests/onboarding*.test.*,tests/wingman*.test.mjs,tests/wingShot*.test.mjs,tests/wing-shot*.test.mjs,tests/auth/*.test.js,tests/image-workflow-mobile-runtime.test.mjs | Select-Object -ExpandProperty FullName; node --test --experimental-default-type=module $files`: **407 tests, 403 passed, 0 failed, 4 skipped**. The skips are two explicitly retired legacy assertions and two external PostgreSQL/limiter environments. regression.log is final output.
- `node --test --experimental-default-type=module crawl/tests/onboarding*.test.mjs crawl/tests/wing-shot-onboarding-handoff.test.mjs crawl/tests/image-workflow-mobile-runtime.test.mjs` from repo root: **51 passed, 0 failed**, focused.log. These execute production components in the existing mocked mobile runtime, not a native UI renderer.
- `npm run test:quick-rating`: PASS, quick-rating.log.
- `npm run lint`: PASS, 0 errors / 100 warnings (same count as starting commit); lint.log.
- `npm run typecheck`: FAIL with only the three unchanged TS5097 Edge Function errors; typecheck.log. These baseline errors are not fixed by this task.
- `node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions`: PASS; typecheck-workaround.log is empty on success. Configuration not changed.
- Staged secret scanner, diff whitespace and scope checks: checks.log (recorded after final staging).

## Blockers and exact safe next validation

1. **P0 backend no-rating upload BLOCKED.** Reproduce: start existing local acceptance services; `docker logs --tail 4 supabase_kong_buffago-polish-acceptance` reports inability to write /home/kong/kong.yml; `Test-NetConnection 127.0.0.1 -Port 55321` fails. Do not run the old staging-upload script as-is: it creates a bucket and modifies flags. Human/backend owner must repair the local harness separately (without production requests or schema edits in this patch), verify the target is loopback/nonproduction, use an existing synthetic account and consented fixture, and query current flags. If disabled, obtain separate authorization for any QA fixture/flag setup. Using the actual existing uploader: choose the verified fixture destination, explicitly pick the fixture image, consent and select attribution, submit with source onboarding and no eligibleRatingId. Check accepted-for-review response and owner history, destination/account association, null rating_id, private original bucket, one submission after repeated tap/retry, no duplicate ledger records and no orphan staged/reserved objects. Record identifiers only in private local evidence, publish sanitized counts/status. Never substitute production or fake a rating ID. No actual upload was attempted after the gateway failed.
2. **P0 Android BLOCKED.** Reproduce commands in tooling.log; installed development client 1.0.5 times out loading local Metro, then reports ANR. Stop/relaunch a compatible already available approved development client and restore Metro connectivity before testing. No build was created for this task. Validate current commit locally; existing app screenshot is not current-code journey proof.
3. **P0 iOS and real auth BLOCKED.** Use an approved current development client on Mac/iPhone and dedicated nonproduction provider/test accounts. Run email immediate and confirmation-required paths (including delayed verification/restart/expiry), Google and Facebook browser cancel/error/retry/success and callback delivery, password reset and unrelated saved/link flows. Verify destination preselection and exactly one navigation, then real review submission. Confirm preview/seed remain local and do not generate rating/coin/XP entries.
4. **P1 closure detection unresolved.** A row that remains visible through RLS and has no supported closure marker will still preselect. Reproduce with a known closed-but-visible fixture. Propose a supported destination availability contract separately; no invented field, schema migration or RLS bypass in this patch.
5. **30-minute intent expiry is intentional.** A confirmation link delayed beyond expiry does not replay upload. The preview remains on-device; user can start a photo from Profile. No persistent Home preview-management UI is introduced here.

## Native screenshot checklist — none passed

Capture welcome, search/no-result/error/keyboard, Wingman verified/queued/cancel/error, all four shared rating screens and thumb at endpoints, celebration score/name/local status, guest offer and explicit-disable alternate, signup/signin/confirmation pending, preselected uploader/change restaurant, fallback picker, validation/consent/error/retry, submitted-for-review, and guest Home. Run short and tall Android plus small iPhone, portrait/landscape, large text, light/dark, RTL, TalkBack/VoiceOver, hardware/iOS back, background/cold restart, and offline/reconnect. Screenshot files in this directory are **only runtime failure evidence**: android-runtime-blocked.png and android-runtime-anr.png. No product mockups substituted.
