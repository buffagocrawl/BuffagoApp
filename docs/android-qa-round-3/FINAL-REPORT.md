# Android QA Round 3 release review

Branch: fix/android-qa-round-3. All 14 improvements remain intact. Cleanup changes release documentation/ignore rules and disposable artifacts, plus redundant EOF blank lines in one SQL file and one test; no application behavior or SQL definition was changed. Nothing is committed, pushed or merged.

## Fourteen improvements

| # | Preserved change | Representative review evidence |
|---|---|---|
| 1 | Favorites and Want to Try; existing saved service/account isolation | [Favorites](screenshots/390-font1/wingdex-favorites.png), [Want to Try](screenshots/390-font1/wingdex-want-to-try.png) |
| 2 | Wing Jury save actions | [Saved restaurant](screenshots/390-font1/jury-save.png) |
| 3 | Compact reveal with pinned actions | [Reveal](screenshots/390-font1/jury-reveal.png), [larger text](screenshots/360-font1.3/jury-reveal.png) |
| 4 | Home spacing/Level cleanup | [Home](screenshots/390-font1/home.png) |
| 5 | Collapsed Crawls filtering/sorting | [Crawls](screenshots/390-font1/crawls.png), [filters](screenshots/390-font1/crawls-filters.png), [filtered state](screenshots/390-font1/crawls-filtered-empty.png) |
| 6 | Rated YTD history navigation and Android Back handling | [Journey](screenshots/390-font1/journey.png), [history](screenshots/390-font1/journey-rating-history.png) |
| 7 | Wing Creator visual cleanup | [Creator](screenshots/390-font1/journey-creator.png) |
| 8 | Wing Shot moderation tabs and authoritative owner vote counts | [Tabs](screenshots/390-font1/wing-shot-tabs.png), [approved](screenshots/390-font1/wing-shot-approved.png), [counts](screenshots/390-font1/wing-shot-votes.png) |
| 9 | Weekly Challenges removed from visible Journey UI | [Journey](screenshots/390-font1/journey.png) |
| 10 | Wingdex is the second bottom tab | [Wingdex](screenshots/390-font1/wingdex-saved-tabs.png) |
| 11 | Explicit Wingdex search-radius expansion | [5 miles](screenshots/390-font1/wingdex-radius-5.png), [10 miles](screenshots/390-font1/wingdex-radius-10.png) |
| 12 | Randomized location-aware Jury; tier progression and stable pages | [Blind state](screenshots/390-font1/jury-blind.png); deployed source verified, live ordering/device behavior not exercised |
| 13 | Redundant Home Wing Shot action removed | [Unrated Home](screenshots/360-font1.3/home.png) |
| 14 | BuffaCoin confirmation, exact quotes, safe retries and optional photo attachment | [Photo](screenshots/390-font1/buffacoin-optional-photo.png), [confirmation](screenshots/390-font1/buffacoin-before-submit.png), [unresolved receipt](screenshots/390-font1/buffacoin-unresolved.png) |

## Deployed backend source

The owner reports approved manual deployment of all Round 3 SQL and the feed Edge Function. Read-only cleanup inspection independently confirms all five function bodies match the checked-in release SQL and both Edge files match active version 2. See [deployment verification](DEPLOYED-BACKEND-VERIFICATION.md).

- [BuffaCoin transaction and pricing SQL](../../crawl/supabase/proposals/android-qa-issue14-buffacoin-confirmation.sql): ledger trigger alone changes balance; wallet/operation locks, exact owner-scoped price, rollback and receipt-first idempotency remain intact.
- [Owner vote counts SQL](../../crawl/docs/android-qa-round-3-owner-vote-counts-proposal.sql): authenticated owner-only counts, including authoritative zero.
- [Randomized Jury SQL](../../crawl/supabase/proposals/android-qa-round-3-randomized-jury-feed.sql): private sessions/manifests/pages/creation log, RLS, quotas, cleanup, capacity bounds and immutable snapshots.
- [Feed Edge source](../../crawl/supabase/functions/wing-jury-feed/index.ts) and [shared dependency](../../crawl/supabase/functions/_shared/wingJury.ts): active v2 source correspondence verified; service-only allocation and verified Auth identity; retryable 429 response.

These retained filenames contain proposal for historical continuity. They are deployed source records, not an instruction to apply again. SQL Editor execution does not automatically add Supabase migration-history entries. No migration repair, SQL replay, data write or Edge redeployment was performed.

## Payment and pricing safeguards

Client quotes use an exact aggregate independent of the truncated public ratings list: 1 + that user's previous paid ratings at the restaurant. Quote batches are bounded to 100 destinations and refreshed before confirmation and before a new submission. Changed or unavailable prices never silently charge. A server cost mismatch proves rollback after receipt lookup and requires renewed consent; ambiguous outcomes retain the original operation, price and payload. Optional photo retry cannot trigger another payment.

Regression tests cover more than 1,100 prior ratings, account isolation, mismatch rollback, lost responses/restarts, concurrent retries, one deduction/ledger/rating/receipt, current wallet refresh and optional photo association. Production customer transactions were not queried or exercised.

## Visual review and remaining verification

The retained 23 screenshots are synthetic development-fixture evidence, mostly 390 dp plus two 360 dp/1.3-text stress examples. They predate the final exact-quote integration and are not proof of current installed production behavior. Redundant matrix captures, XML and diagnostics were deleted; no matrix or visual cycle was repeated.

The earlier native payment recovery run stopped at a case-sensitive Later/LATER capture-harness locator. The expected unresolved screen is retained; final native Check Rating Status after restart and complete paid-photo recovery remain unverified. The permanent harness is retained unchanged. This cleanup does not start another device run.

Backend deployment is no longer a blocker. Final visual approval, authorized physical-device/native paid recovery and real gateway/load-capacity verification remain open. Shared guest quotas can limit legitimate guests during heavy traffic; per-session catalog and overall capacity limits require operational monitoring.

## Final Git preparation

See [cleanup/security report](GIT-CLEANUP-REPORT.md) for current test/typecheck/lint results, security findings, deletion counts, unrelated preserved artifacts and final status. [Commit manifest](COMMIT-MANIFEST.txt) lists every proposed path; it includes deployed source, regression fixtures and maintenance capture scripts. Local credentials remain ignored and untouched. No stage/commit/push/merge/build/production mutation is authorized by this cleanup task.
