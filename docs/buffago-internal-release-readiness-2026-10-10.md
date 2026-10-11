# Buffago Android internal release readiness

Status: PREPARED, pending release-scope confirmation. No commit, push, main merge, EAS build, store submission, backend redeployment, or production-data write was performed in this cleanup session.

## Scope and repository audit

The starting feature branch and freshly fetched origin/main both point to `960a542`; ahead/behind was 0/0. The working tree contains a substantial local replacement of delete-account and historical deployment/rating investigations. The owner requested a stop for confirmation when unrelated changes are found. Proposed exclusion of these files is awaiting confirmation; they remain in place.

Exact proposed retained and excluded paths are in `buffago-internal-release-file-plan.json`. Retain feature application code, required tests and test runners, frozen SQL/package validation, API contract, production account-RPC evidence, security-hotfix SQL/evidence, deployment hashes, handoff and maintenance/rollback evidence. Older evidence describes earlier authorization states; the deployment confirmation in this session and the fresh hosted inventory below supersede its predeployment status statements. These documents are evidence, not instructions to deploy again.

Exclude screenshots, UI capture output, review ZIP, generated local deployment bundles, debug/test logs, redundant source summaries and historical investigations from the proposed release commit. No local file was deleted. Existing tracked assets and historical evidence remain intact. Inventory covered 2,134 tracked files, 149 untracked files, 24 modified files and 764 ignored directory/file entries at inventory time. Some unrelated Jalapeno temporary directories produce access-denied warnings: their contents were not inspected or removed. Ignored local environment files, signing material, node_modules, native projects and Expo caches stay outside Git. Complete enumerated inventory and fresh test output are under ignored `crawl/.expo/final-release-*`.

Tracked secret/public-config scan passed. Screening modified/untracked text found no credential/private-key patterns; machine paths appeared in three excluded historical files: phase-final-history-consumers.test.mjs, buffago-final-application-evidence.md and codex-handoff.md. Staged scan remains required after final staging. This is pattern screening, not an assertion that every ignored byte was examined.

## Tests

| Check | Result |
| --- | --- |
| Typecheck | PASS |
| Lint | PASS: 0 errors, 95 warnings |
| Feature/application/home/social/privacy/security tests | 135 passed, 0 failed, 4 optional Deno runtime tests skipped |
| Auth regression tests | 24 passed, 0 failed |
| Focused database foundation, frozen release and hotfix tests | 22 passed, 0 failed; disposable PostgreSQL 17.6 and PGlite only |
| Existing database JS suite | 50 passed, 2 failed: documented checksum drift and duplicate migration version |
| Expo Doctor | 18/18 passed |
| Expo dependency alignment | Up to date |
| Production internal-release configuration assertions | PASS |
| git diff --check | PASS |

Migration history was not repaired, replayed or suppressed. Five manifest checksum mismatches and one duplicate version remain documented historical failures; these need an explicit release disposition before declaring all checks green. No unrelated historical investigation was reopened.

## Fresh hosted verification

`supabase functions list --project-ref vhfxnizaxdanmvmouuaf --output json` confirmed:

| Function | Status | Version | verify_jwt |
| --- | --- | --- | --- |
| wing-jury-vote | ACTIVE | 1 | true |
| wing-jury-feed | ACTIVE | 1 | false |
| wing-jury-reveal | ACTIVE | 1 | false |
| delete-account | ACTIVE | 15 | true |

Non-writing HTTP checks: guest feed 200 with one photo and only submission_id/signed_url/media_type/expires_at; invalid-bearer feed 200 under its guest boundary; invalid feed limit 400; malformed reveal photo 400; nonexistent reveal photo 404; missing and invalid vote credentials both 401; feed/reveal GET both 405; reveal OPTIONS 204. Application responses carry no-store. No votes, saved items, accounts or media were created/deleted. Authenticated positive paths and a real-photo post-verdict reveal were not exercised against production.

The frozen SQL `20261010192747_wing_jury_saved_destinations_forward.sql` was applied manually in Supabase SQL Editor, per owner confirmation. There is NO corresponding migration-ledger entry. It remains retained in its reviewed local package path. Do not run db push, reapply this SQL, or silently insert/repair ledger history.

Distributed rate limiting is NOT independently verified. The handlers do not implement distributed limits. Local body-size checks and unauthorized-vote rejection do not establish rate-limit acceptance. Existing account-upload/deletion behavior remains outside this release; local delete-account replacement is excluded and deployed v15 was not changed. No claim of complete production security acceptance is made.

## Android and Play preparation

Added `internal-testing` EAS build profile extending production: signed store AAB, autoIncrement, production EAS environment, isolated `internal-testing` update channel, Wing Jury and saved destinations enabled through profile-specific environment flags. Production defaults remain off for these two features. No OTA update or public-release submission was run.

Added submission profile `internal-testing` with Android track explicitly `internal`. Production EAS variables were read inside `eas env:exec` and checked without printing keys: expected Supabase URL/project, nonempty public key, and nonempty Android Maps key passed. Key restrictions/signing-fingerprint authorization were not independently verified. Package is `com.buffago.app`; app version 1.0.5, runtimeVersion 1.0.4. Permissions: fine location, notifications, camera, audio recording; background location is blocked. Remote versionCode is currently 123; the existing autoIncrement policy assigns the next code when a build starts. Local versionCode 6 is ignored by EAS remote versioning.

Configuration verification: from crawl, `eas env:exec production 'node scripts/verify-internal-release-config.mjs' --non-interactive`.

After scope/history disposition and checks on the exact committed tree: commit selected files, push feature branch, fetch/compare main, merge only a clean verified tree, push main and verify origin/main. Preserve the feature branch. Then from crawl run `eas build --platform android --profile internal-testing --non-interactive`. Record its exact build ID/AAB/versionCode; submit that ID using `eas submit --platform android --profile internal-testing --id <BUILD_ID> --non-interactive`. If remote signing/store credentials are missing, stop and report the exact required credential action. Never select the production submission profile.

AAB/build ID: none; build not started. Google Play internal-testing submission: not attempted. No install link is available yet.
